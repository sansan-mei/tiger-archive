const { test } = require("node:test");
const assert = require("node:assert/strict"),
  fs = require("node:fs"),
  vm = require("node:vm"),
  path = require("node:path");
const T = require("three"),
  C = require("../battle-core.js"),
  manifest = require("../app-manifest.js");
const data = require("../client/models/arsenal.json");
const character = structuredClone(require("../client/models/paimon.json"));
for (const image of character.images) image.url = {data: [255,255,255,255], width: 1, height: 1, type: "Uint8Array"};
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
    "client/paimon-rig.js",
    "client/model-assets.js",
    "tank-model.js",
    "client/recoil.js",
    "client/units.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      context,
    );
  return context.window;
}
const fetchKit = async (url) => ({ ok: true, json: async () => url?.includes("paimon") ? character : data });
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
      assert.equal(v.limbs.length, 0);
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
      assert.ok(triangles < (tankType === "human" ? 17000 : 8000), `triangles ${triangles}`);
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
test("each asset is fetched once and disposing a wreck leaves other views and subsequent respawns intact", async () => {
  const b = browser();
  let requests = 0;
  const fetch = async (url) => {
    requests++;
    return fetchKit(url);
  };
  await Promise.all([
    b.TankModelAssets.load(T, fetch),
    b.TankModelAssets.load(T, fetch),
  ]);
  assert.equal(requests, 2);
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

test("reference human walks, aims and recoils with every weapon including the pistol", async () => {
  const b = browser();
  await b.TankModelAssets.load(T, fetchKit);
  for (const weaponType of Object.keys(C.WEAPONS)) {
    const entity = { ...new C.Battle().entities[0], id: "self", tankType: "human", weaponType,
      x: 0, y: 0, z: 0, heading: 0, aim: .6, pitch: .25, speed: 4, alive: true };
    const units = b.TankClient.createUnits({ T, C, scene: new T.Scene(), floorGroups: [],
      getEntities: () => [entity], getPlayerId: () => "self", effects: [], sound() {}, reduced: false });
    await units.modelsReady;
    const view = units.views.get("self");
    assert.equal(view.tank.getObjectByName("human").userData.rig, "paimon-skinned");
    assert.equal(view.limbs.length, 0);
    view.recoil = 1;
    units.update({ state: { entities: [entity], bullets: [] }, truth: { tick: 0, status: "playing" },
      dt: 1 / 60, time: 0, cameraFloor: 0, camera: new T.PerspectiveCamera() });
    const leg = view.tank.getObjectByName("足DL");
    assert.ok(leg.quaternion.angleTo(new T.Quaternion()) > .01);
    assert.ok(view.tank.getObjectByName("上半身").isBone);
    assert.equal(view.gun.rotation.z, -.25);
    assert.ok(view.gun.position.x > -.35);
    assert.ok(view.turret.position.x > 0);
    const skin = [...view.originals.values()].find(m => m.name === "paimon-皮肤");
    assert.ok(skin);
    assert.ok(skin.map);
    view.dispose();
  }
});

test("character download failure retains the original Blender human", async () => {
  const b = browser();
  assert.equal(await b.TankModelAssets.load(T, async url => url.includes("paimon") ? { ok: false } : fetchKit(url)), true);
  const view = b.createTankModel(T, { tankType: "human", weaponType: "rocket" });
  assert.equal(view.assetSource, "blender");
  assert.equal(view.limbs.length, 2);
  assert.equal(view.tank.getObjectByName("human").userData.rig, undefined);
  view.dispose();
});

test("runtime character preserves UVs, textures, weights and manifest registration", () => {
  assert.ok(manifest.assets.includes("client/models/paimon.json"));
  const asset = require("../client/models/paimon.json");
  assert.equal(asset.images.length, 5);
  assert.ok(asset.images.every(i => /^data:image\/(jpeg|png);base64,/.test(i.url)));
  assert.ok(asset.geometries.every(g => g.data.attributes.uv && g.data.attributes.skinIndex && g.data.attributes.skinWeight));
  assert.ok(asset.skeletons[0].bones.length > 100);
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

test("Paimon instances have independent skeletons and walking deforms weighted vertices", async () => {
  const b = browser();
  await b.TankModelAssets.load(T, fetchKit);
  const a = b.createTankModel(T, {tankType: 'human', weaponType: 'pistol'});
  const other = b.createTankModel(T, {tankType: 'human', weaponType: 'pistol'});
  const meshes = [];
  a.tank.traverse(o => {if (o.isSkinnedMesh) meshes.push(o);});
  const otherBones = [];
  other.tank.traverse(o => {if (o.isBone) otherBones.push(o);});
  assert.ok(meshes.length > 0);
  assert.ok(meshes.every(m => m.skeleton.bones.every(bone => !otherBones.includes(bone))));
  a.tank.updateMatrixWorld(true);
  const before = meshes.map(m => Array.from({length: m.geometry.attributes.position.count},
    (_, i) => m.getVertexPosition(i, new T.Vector3())));
  a.animateCharacter({travel: .5, speed: 4, aim: .4, recoil: 1});
  a.tank.updateMatrixWorld(true);
  let moved = 0;
  meshes.forEach((m, j) => before[j].forEach((p, i) => {
    if (m.getVertexPosition(i, new T.Vector3()).distanceTo(p) > .01) moved++;
  }));
  assert.ok(moved > 500, `${moved} vertices moved`);
  const leg = other.tank.getObjectByName('足DL');
  assert.ok(leg.quaternion.angleTo(new T.Quaternion()) < 1e-6);
  a.dispose();
  other.animateCharacter({travel: 1, speed: 4});
  assert.ok(leg.quaternion.angleTo(new T.Quaternion()) > .1);
  other.dispose();
});

test("both hands stay on the lowered weapon grips through aim, walking and recoil", async () => {
  const b = browser();
  await b.TankModelAssets.load(T, fetchKit);
  for (const weaponType of Object.keys(C.WEAPONS)) {
    const view = b.createTankModel(T, {tankType: 'human', weaponType});
    assert.ok(view.gunRestPosition.y + view.spec.mount[1] < 1.3);
    for (const aim of [0, .8, -1.6, Math.PI])
      for (const pitch of [-.65, 0, .65]) {
        view.tank.position.set(17, 3, -9);
        view.tank.rotation.set(.1, .7, -.04);
        view.turret.rotation.y = aim;
        view.gun.rotation.z = -pitch;
        view.gun.position.x = view.gunRestPosition.x + .05;
        view.animateCharacter({aim, pitch, recoil: .5, speed: 4, travel: .6});
        view.tank.updateMatrixWorld(true);
        for (const side of ['R', 'L']) {
          const hand = view.tank.getObjectByName('手首' + side).getWorldPosition(new T.Vector3());
          const grip = view.gun.getObjectByName('hand-grip-' + side).getWorldPosition(new T.Vector3());
          assert.ok(hand.distanceTo(grip) < .025,
            `${weaponType}/${side} aim=${aim} pitch=${pitch}: ${hand.distanceTo(grip)}`);
        }
      }
    view.dispose();
  }
});
