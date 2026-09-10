/* Blender-authored scenery skins. The shared map remains the collision authority. */
(window.TankClient ??= {}).createEnvironment = function ({
  T,
  C,
  floorGroups,
  covers,
  fetchImpl = (...args) => globalThis.fetch(...args),
  onError = () => {},
}) {
  // Flat markings use a handful of instanced draws, not hundreds of small meshes.
  const boxGeometry = new T.BoxGeometry(1, 1, 1);
  const colors = {
    paint: 0xeee0b8,
    seam: 0x80908a,
    teal: 0x548c8c,
    yellow: 0xe8af57,
  };
  const transform = new T.Object3D();
  for (const level of C.MAP.levels) {
    const batches = Object.fromEntries(Object.keys(colors).map((k) => [k, []]));
    const onDeck = (x, z) =>
      C.deckRects(C.MAP, level).some(
        (q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1,
      );
    function mark(color, x, z, w, d) {
      if (
        ![
          [x - w / 2, z - d / 2],
          [x + w / 2, z + d / 2],
        ].every(([px, pz]) => onDeck(px, pz))
      )
        return;
      if (
        C.MAP.ramps.some(
          (r) =>
            Math.abs(x - r.a.x) < r.width / 2 + w / 2 &&
            z + d / 2 > Math.min(r.a.z, r.b.z) &&
            z - d / 2 < Math.max(r.a.z, r.b.z),
        )
      )
        return;
      batches[color].push([x, z, w, d]);
    }
    for (let x = -level.bound + 6; x < level.bound; x += 12)
      for (let z = -level.bound + 6; z < level.bound; z += 12) {
        mark("seam", x, z, 10.5, 0.035);
        mark("seam", x - 5.25, z + 5.25, 0.035, 10.5);
      }
    // Center lane and repair apron remain flat, with no new invisible barriers.
    for (let z = -level.bound + 6; z < level.bound - 3; z += 8) {
      mark("paint", 0, z, 0.25, 3);
      for (const x of [-5.4, 5.4]) mark("paint", x, z, 0.12, 6);
    }
    for (const o of C.MAP.obstacles.filter(
      (o) => o.floor === level.id && o.w >= 6 && o.d >= 5,
    )) {
      for (const side of [-1, 1]) {
        mark("yellow", o.x + side * (o.w / 2 + 0.55), o.z, 0.16, o.d + 1);
        mark("yellow", o.x, o.z + side * (o.d / 2 + 0.55), o.w + 1, 0.16);
      }
    }
    if (level.id === 0) {
      for (const x of [-23, -17, -11]) {
        mark("paint", x, 21, 0.15, 7);
        mark("paint", x + 2.5, 24.5, 5, 0.15);
      }
      for (let i = 0; i < 6; i++) mark("paint", -17 + i * 1.6 - 4, 16, 1, 0.8);
      // Repair cross on the apron; no decal image or texture download.
      mark("teal", -17, 29, 4, 4);
      mark("paint", -17, 29, 0.55, 2.5);
      mark("paint", -17, 29, 2.5, 0.55);
    }
    for (const [name, entries] of Object.entries(batches)) {
      if (!entries.length) continue;
      const mesh = new T.InstancedMesh(
        boxGeometry,
        new T.MeshToonMaterial({ color: colors[name] }),
        entries.length,
      );
      mesh.name = "apron-" + name + "-" + level.id;
      mesh.receiveShadow = true;
      // Tiny layer separation keeps cross/paint above the colored floor patch.
      entries.forEach(([x, z, w, d], i) => {
        transform.position.set(
          x,
          level.y + (name === "paint" ? 0.044 : 0.025),
          z,
        );
        transform.rotation.set(0, 0, 0);
        transform.scale.set(w, 0.008, d);
        transform.updateMatrix();
        mesh.setMatrixAt(i, transform.matrix);
      });
      floorGroups[level.id].add(mesh);
    }
  }
  const controller = new AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), 8000);
  const ready = (async () => {
    try {
      const response = await fetchImpl(
        "client/environment/maintenance-kit.json",
        { signal: controller.signal },
      );
      if (!response.ok) throw new Error("Maintenance scenery unavailable");
      const data = await response.json();
      if (data.metadata?.generator !== "Blender maintenance kit")
        throw new Error("Unexpected scenery data");
      const kit = new T.ObjectLoader().parse(data);
      const prototypes = new Map(
        kit.children.map((model) => [model.name, model]),
      );
      for (const name of ["workshop", "cargo", "power"])
        if (!prototypes.has(name)) throw new Error("Missing scenery model");
      for (const o of C.MAP.obstacles) {
        const cover = covers.get(o.id);
        if (!cover || o.h < 2 || Math.min(o.w, o.d) < 4) continue;
        const kind = ["g1", "g3", "t1"].includes(o.id)
          ? "workshop"
          : ["g4", "g5", "t3"].includes(o.id)
            ? "power"
            : "cargo";
        const model = prototypes.get(kind).clone(true);
        model.name = "cover-" + o.id + "-" + kind;
        model.scale.set(o.w, o.h, o.d);
        model.position.set(o.x, C.MAP.levels[o.floor].y, o.z);
        model.userData.coverId = o.id;
        // Remove only this cover's placeholder meshes; shared materials are reused elsewhere.
        cover.clear();
        cover.add(model);
      }
      return true;
    } catch (error) {
      onError(error);
      return false;
    } finally {
      globalThis.clearTimeout(timer);
    }
  })();
  return { ready };
};
