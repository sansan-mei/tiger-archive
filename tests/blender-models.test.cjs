const { test } = require("node:test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const T = require("three"),
  C = require("../battle-core.js"),
  manifest = require("../app-manifest.js");
const data = require("../client/models/arsenal.json");
function browser() {
  const context = vm.createContext({
    window: { TankBattle: C },
    AbortController,
    setTimeout,
    clearTimeout,
    console: { warn() {} },
  });
  for (const file of [
    "core/abilities.js",
    "plugins/registry.js",
    "plugins/tanks/common.js",
    ...manifest.plugins,
    "client/model-assets.js",
    "tank-model.js",
    "client/units.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      context,
    );
  return context.window;
}
const fetchKit = async () => ({ ok: true, json: async () => data });
test("all sixteen Blender loadouts retain muzzle reach, pivots and bounded drawing cost", async () => {
  const b = browser();
  assert.equal(await b.TankModelAssets.load(T, fetchKit), true);
  for (const tankType of Object.keys(C.PLAYER_TANKS))
    for (const weaponType of Object.keys(C.WEAPONS).filter((id) => id !== "pistol")) {
      const v = b.createTankModel(T, { tankType, weaponType });
      assert.equal(v.assetSource, "blender");
      v.tank.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(v.gun);
      const reach = v.weapon.muzzle * v.spec.scale * (v.spec.muzzleScale || 1);
      assert.ok(
        Math.abs(bounds.min.x + reach) < 0.0001,
        `${tankType}/${weaponType} muzzle ${bounds.min.x} vs ${reach}`,
      );
      assert.equal(v.gun.parent, v.turret);
      assert.equal(v.turret.parent, v.tank);
      assert.equal(
        v.wheels.length,
        tankType === "human" ? 0 : tankType === "light" ? 6 : 10,
      );
      assert.equal(v.limbs.length, tankType === "human" ? 2 : 0);
      let meshes = 0,
        triangles = 0,
        painted = 0;
      v.tank.traverse((m) => {
        if (!m.isMesh || !m.visible) return;
        meshes++;
        triangles +=
          (m.geometry.index?.count || m.geometry.attributes.position.count) / 3;
        assert.ok(m.material);
        if (m.material === v.paint) painted++;
        for (const a of Object.values(m.geometry.attributes))
          assert.ok([...a.array].every(Number.isFinite));
      });
      assert.ok(painted > 0);
      assert.ok(meshes <= 30, `meshes ${meshes}`);
      assert.ok(triangles < 8000, `triangles ${triangles}`);
      const p = v.gun.localToWorld(new T.Vector3(-1, 0, 0));
      v.turret.rotation.y = 1;
      v.gun.rotation.z = -0.4;
      v.gun.position.x += 0.2;
      v.tank.updateMatrixWorld(true);
      assert.ok(
        v.gun.localToWorld(new T.Vector3(-1, 0, 0)).distanceTo(p) > 0.5,
      );
      for (const w of v.wheels) {
        const before = new T.Box3().setFromObject(w).getCenter(new T.Vector3());
        w.rotateY(0.7);
        v.tank.updateMatrixWorld(true);
        assert.ok(
          new T.Box3()
            .setFromObject(w)
            .getCenter(new T.Vector3())
            .distanceTo(before) < 0.0001,
        );
      }
      v.dispose();
    }
});
test("cached load is single-request and disposing a wreck leaves other views and subsequent respawns intact", async () => {
  const b = browser();
  let requests = 0;
  const fetch = async () => {
    requests++;
    return fetchKit();
  };
  await Promise.all([
    b.TankModelAssets.load(T, fetch),
    b.TankModelAssets.load(T, fetch),
  ]);
  assert.equal(requests, 1);
  const create = () =>
      b.createTankModel(T, { tankType: "heavy", weaponType: "rocket" }),
    a = create(),
    other = create();
  const owned = new Set(),
    others = new Set();
  for (const v of [a, other]) {
    const set = v === a ? owned : others;
    v.tank.traverse((m) => {
      if (m.geometry) set.add(m.geometry);
      if (m.material) set.add(m.material);
    });
    for (const m of v.originals.values()) set.add(m);
  }
  const disposed = new Set();
  for (const r of [...owned, ...others])
    r.addEventListener("dispose", () => disposed.add(r));
  a.tank.traverse((m) => {
    if (m.isMesh && m !== a.shield && m !== a.frontShield) m.material = a.wreck;
  });
  a.dispose();
  assert.ok([...owned].every((r) => disposed.has(r)));
  assert.ok([...others].every((r) => !disposed.has(r)));
  const respawn = create();
  assert.equal(respawn.assetSource, "blender");
  assert.ok(respawn.originals.size > 0);
  other.dispose();
  respawn.dispose();
});
test("failed asset loading leaves procedural visuals and unknown plugins can still use their hooks", async () => {
  const b = browser();
  assert.equal(
    await b.TankModelAssets.load(T, async () => ({ ok: false })),
    false,
  );
  const v = b.createTankModel(T, { tankType: "human", weaponType: "rocket" });
  assert.equal(v.assetSource, "procedural");
  v.dispose();
  const loaded = browser();
  await loaded.TankModelAssets.load(T, fetchKit);
  assert.equal(
    loaded.TankModelAssets.build(
      {},
      { tankType: "light", weaponType: "future-plugin" },
    ),
    false,
  );
});
test("optional model completion rebuilds the current loadout instead of an obsolete captured session", async () => {
  const b = browser();
  let resolve;
  const request = new Promise((r) => (resolve = r));
  b.TankModelAssets.load(T, () => request);
  let entities = [{ id: "p1", tankType: "light", weaponType: "rapid" }];
  const scene = new T.Scene();
  const units = b.TankClient.createUnits({
    T,
    C,
    scene,
    floorGroups: [],
    getEntities: () => entities,
    getPlayerId: () => "p1",
  });
  units.createViews();
  const old = units.views.get("p1");
  assert.equal(old.assetSource, "procedural");
  entities = [{ id: "p1", tankType: "human", weaponType: "rocket" }];
  resolve(await fetchKit());
  assert.equal(await units.modelsReady, true);
  const current = units.views.get("p1");
  assert.equal(current.assetSource, "blender");
  assert.equal(current.spec, C.TANKS.human);
  assert.equal(old.tank.parent, null);
  assert.equal(current.tank.parent, scene);
  current.dispose();
});
