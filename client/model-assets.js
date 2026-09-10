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
      if (!models?.has(tankType) || !models.has(weaponType)) return false;
      // Each live view owns its geometry; disposal never invalidates another player or cache.
      let wheelMaterial;
      function copy(name) {
        const clone = models.get(name).clone(true);
        clone.traverse((o) => {
          if (o.isMesh) {
            o.geometry = o.geometry.clone();
            o.material =
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
      for (const child of [...turret.children]) ctx.turret.add(child);
      hull.remove(turret);
      ctx.tank.add(hull);
      const weapon = copy(weaponType);
      // All authoring barrels end at local X=-3.5. Keep the shared gameplay muzzle distance.
      weapon.scale.x = ctx.weaponLength / 3.5;
      ctx.gun.add(weapon);
      return true;
    },
  };
})();
