/* Optional Blender appearance library. Gameplay and fallback plugins stay synchronous. */
window.TankModelAssets = (() => {
  let models, pending;
  return {
    load(T, fetchImpl = (...args) => globalThis.fetch(...args)) {
      if (pending) return pending;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 8000);
      pending = (async () => {
        try {
          const response = await fetchImpl("client/models/arsenal.json", {
            signal: controller.signal,
          });
          if (!response.ok) throw new Error("Arsenal unavailable");
          const data = await response.json();
          if (data.metadata?.generator !== "Blender arsenal v1")
            throw new Error("Unexpected arsenal");
          const kit = new T.ObjectLoader().parse(data);
          const loaded = new Map(kit.children.map((m) => [m.name, m]));
          for (const name of [
            "light",
            "medium",
            "heavy",
            "human",
            "standard",
            "rapid",
            "laser",
            "rocket",
          ]) {
            if (!loaded.has(name)) throw new Error("Incomplete arsenal");
          }
          for (const name of ["light", "medium", "heavy", "human"])
            if (!loaded.get(name).getObjectByName("turret"))
              throw new Error("Missing turret pivot");
          // Character failure must not discard the existing vehicle/weapon library.
          try {
            const characterResponse = await fetchImpl("client/models/paimon.json", {
              signal: controller.signal,
            });
            if (!characterResponse.ok) throw new Error("Character unavailable");
            const characterData = await characterResponse.json();
            if (characterData.metadata?.generator !== "Paimon skinned character")
              throw new Error("Unexpected character");
            const character = await new T.ObjectLoader().parseAsync(characterData);
            if (!character.getObjectByName("足DL") || !character.getObjectByName("足DR"))
              throw new Error("Incomplete character joints");
            loaded.set("human", character);
          } catch (error) {
            console.warn("角色外观加载失败，保留原人类模型：", error.message);
          }
          models = loaded;
          return true;
        } catch (error) {
          console.warn("机甲外观加载失败，保留程序化模型：", error.message);
          return false;
        } finally {
          clearTimeout(timer);
        }
      })();
      return pending;
    },
    build(ctx, { tankType, weaponType }) {
      if (!models?.has(tankType) ||
          (!models.has(weaponType) && !window.TankPlugins?.weapons[weaponType])) return false;
      // Each live view owns its geometry; disposal never invalidates another player or cache.
      let wheelMaterial;
      const characterMaterials = new Map();
      function copy(name) {
        const source = models.get(name), clone = source.clone(true);
        const nodes = new Map();
        function pair(a, b) {
          nodes.set(a, b);
          a.children.forEach((child, i) => pair(child, b.children[i]));
        }
        pair(source, clone);
        source.traverse(o => {
          if (!o.isSkinnedMesh) return;
          const mesh = nodes.get(o);
          mesh.skeleton = o.skeleton.clone();
          mesh.skeleton.bones = o.skeleton.bones.map(b => nodes.get(b));
          mesh.bind(mesh.skeleton, o.bindMatrix);
        });
        clone.traverse((o) => {
          if (o.isMesh) {
            o.geometry = o.geometry.clone();
            o.material = o.material.name.startsWith("paimon-")
              ? (characterMaterials.get(o.material.name) || (() => {
                  const material = o.material.clone();
                  characterMaterials.set(o.material.name, material);
                  return material;
                })()) :
              o.material.name === "wheel"
                ? (wheelMaterial ??= new ctx.T.MeshToonMaterial({
                    vertexColors: true,
                  }))
                : ctx[o.material.name];
          }
          if (o.userData.animation === "wheel") ctx.wheels.push(o);
          if (o.userData.animation === "limb") ctx.limbs.push(o);
        });
        return clone;
      }
      const hull = copy(tankType),
        turret = hull.getObjectByName("turret");
      if (hull.userData.rig === "paimon-skinned") {
        window.TankPaimonRig.attach(ctx, hull);
        ctx.block(0.05, 0.13, 0.20, 0.20, 1.05, 0, ctx.paint, ctx.tank);
      } else {
        for (const child of [...turret.children]) ctx.turret.add(child);
        hull.remove(turret);
      }
      ctx.tank.add(hull);
      if (models.has(weaponType)) {
        const weapon = copy(weaponType);
        // All authoring barrels end at local X=-3.5. Keep the shared gameplay muzzle distance.
        weapon.scale.x = ctx.weaponLength / 3.5;
        ctx.gun.add(weapon);
      } else {
        window.TankPlugins.weapons[weaponType].buildVisual(ctx);
      }
      return true;
    },
  };
})();
