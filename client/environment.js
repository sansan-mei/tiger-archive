/* Quaternius nature skins; the shared map owns solid rock and trunk collisions. */
(window.TankClient ??= {}).createEnvironment = function ({
  T, C, floorGroups, covers,
  fetchImpl = (...args) => globalThis.fetch(...args), onError = () => {},
}) {
  const controller = new AbortController();
  let mode = 'pvp', rampMeshes = [];
  const setMode = (next) => { mode = next; for (const mesh of rampMeshes) mesh.visible = mode !== 'pve'; };
  const timer = globalThis.setTimeout(() => controller.abort(), 15000);
  const ready = (async () => {
    try {
      const response = await fetchImpl('client/environment/nature-kit.json', {signal: controller.signal});
      if (!response.ok) throw Error('Nature scenery unavailable');
      const data = await response.json();
      if (data.metadata?.generator !== 'Quaternius Stylized Nature MegaKit') throw Error('Unexpected scenery data');
      const kit = await new T.ObjectLoader().parseAsync(data);
      const models = new Map(kit.children.map(model => [model.name, model]));
      const names = ['CommonTree_3', 'CommonTree_5', 'Pine_5', 'Bush_Common_Flowers',
        'Grass_Common_Short', 'Flower_3_Group', 'Rock_Medium_1', 'Rock_Medium_2'];
      for (const name of names) if (!models.has(name)) throw Error('Missing nature model: ' + name);
      const groups = C.MAP.levels.map(() => new T.Group()), replacements = new Map();
      const batches = new Map(), matrix = new T.Object3D();
      function plant(name, floor, x, y, z, size, rotation = 0, rampOnly = false) {
        const key = floor + ':' + name + ':' + rampOnly;
        if (!batches.has(key)) batches.set(key, {name, floor, rampOnly, entries: []});
        matrix.position.set(x, y, z); matrix.scale.setScalar(size);
        matrix.rotation.set(0, rotation, 0); matrix.updateMatrix();
        batches.get(key).entries.push(matrix.matrix.clone());
      }
      let seed = 8917;
      const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
      for (const [i, o] of C.MAP.obstacles.entries()) {
        const y = C.MAP.levels[o.floor].y;
        if (o.kind === 'tree') {
          plant(names[i % 3], o.floor, o.x, y, o.z, 10 + (i % 4), i * 2.4);
          replacements.set(o.id, null);
          continue;
        }
        const rock = models.get(i % 2 ? 'Rock_Medium_1' : 'Rock_Medium_2').clone(true);
        rock.name = 'rock-' + o.id; rock.userData.coverId = o.id;
        rock.position.set(o.x, y, o.z); rock.scale.set(o.w, o.h, o.d);
        replacements.set(o.id, rock);
        // Flowers grow beside solid cover; vegetation itself never blocks aiming.
        if (i % 3 === 0) plant('Bush_Common_Flowers', o.floor, o.x + o.w * .35, y + o.h * .65, o.z, Math.min(1.7, o.w * .3), i);
      }
      for (const r of C.MAP.ramps) {
        for(let i=1;i<18;i++) for(const side of [-1,1]) {
          const z=r.a.z+(r.b.z-r.a.z)*i/18;
          plant(i%5===0?'Flower_3_Group':'Grass_Common_Short',r.a.floor,
            r.a.x+side*(r.width/2-.65),C.rampHeight(C.MAP,r,z)+.02,z,.3+(i%3)*.12,i,true);
        }
      }
      for (const level of C.MAP.levels) {
        const rects = C.deckRects(C.MAP, level);
        for (let i = 0; i < (level.id ? 300 : 3200); i++) {
          const x = (random() * 2 - 1) * (level.bound - 3), z = (random() * 2 - 1) * (level.bound - 3);
          if (!rects.some(q => x > q.x0 + 1 && x < q.x1 - 1 && z > q.z0 + 1 && z < q.z1 - 1)) continue;
          if (Math.abs(x) < 7 || (!level.id && (Math.abs(z) < 6 || Math.abs(Math.hypot(x,z) - 102) < 6))) continue;
          if (C.MAP.ramps.some(r => Math.abs(x - r.a.x) < r.width/2 + 2 && z > Math.min(r.a.z,r.b.z) - 3 && z < Math.max(r.a.z,r.b.z) + 3)) continue;
          if (C.MAP.obstacles.some(o => o.floor === level.id && Math.abs(x-o.x)<o.w/2+1.5 && Math.abs(z-o.z)<o.d/2+1.5)) continue;
          plant(i % 5 === 0 ? 'Flower_3_Group' : 'Grass_Common_Short', level.id, x, level.y+.01, z, .35+random()*.6, random()*Math.PI*2);
        }
      }
      // A distant forest forms the horizon, outside all playable collision bounds.
      for (let i = 0; i < 96; i++) {
        const side = i % 4, along = (random()*2-1)*153, distance = 139+random()*22;
        const x = side < 2 ? (side ? -distance : distance) : along;
        const z = side < 2 ? along : (side === 2 ? distance : -distance);
        plant(names[i%3], 0, x, -.3, z, 11+random()*9, random()*Math.PI*2);
      }
      for (const {name, floor, rampOnly, entries} of batches.values()) {
        for (const source of models.get(name).children) {
          const mesh = new T.InstancedMesh(source.geometry, source.material, entries.length);
          mesh.name = 'nature-' + name;
          mesh.userData.rampOnly = rampOnly;
          if (rampOnly) { mesh.visible = mode !== 'pve'; rampMeshes.push(mesh); }
          mesh.userData.aimIgnore = !/Bark/.test(source.material.name);
          // Solid trunks are represented by shared-map collision; foliage is decorative.
          mesh.castShadow = true; mesh.receiveShadow = true;
          entries.forEach((m, i) => mesh.setMatrixAt(i, m));
          mesh.computeBoundingSphere(); groups[floor].add(mesh);
        }
      }
      // Commit only after the complete kit has decoded, preserving fallbacks on failure.
      for (const [id, rock] of replacements) {
        const cover = covers.get(id);
        if (cover) { cover.clear(); if (rock) cover.add(rock); }
      }
      groups.forEach((g,i) => { g.name = 'woodland-' + i; floorGroups[i].add(g); });
      return true;
    } catch (error) { onError(error); return false; }
    finally { globalThis.clearTimeout(timer); }
  })();
  return {ready,setMode};
};
