const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const T = require("three"),
  C = require("../battle-core.js");
const manifest = require("../app-manifest.js");
function context() {
  const ctx = vm.createContext({ window: { TankBattle: C } });
  for (const file of [
    "core/abilities.js",
    "plugins/registry.js",
    "plugins/tanks/common.js",
    ...manifest.plugins,
    "tank-model.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      ctx,
    );
  return ctx.window;
}
test("all cartoon loadouts retain pivots, fit the neutral muzzle reach and stay within the mesh budget", () => {
  const browser = context();
  for (const tankType of Object.keys(C.PLAYER_TANKS))
    for (const weaponType of Object.keys(C.WEAPONS)) {
      const view = browser.createTankModel(T, { tankType, weaponType });
      view.tank.updateMatrixWorld(true);
      const bounds = new T.Box3().setFromObject(view.gun);
      const reach =
        C.WEAPONS[weaponType].muzzle *
        view.spec.scale *
        (view.spec.muzzleScale || 1);
      assert.ok(
        Math.abs(bounds.min.x + reach) < 0.0001,
        `${tankType}/${weaponType} reversed or misplaced muzzle`,
      );
      assert.equal(view.gun.parent, view.turret);
      assert.equal(view.turret.parent, view.tank);
      assert.equal(view.shield.visible, false);
      assert.equal(view.frontShield.visible, false);
      let meshes = 0,
        triangles = 0;
      view.tank.traverse((mesh) => {
        if (!mesh.isMesh || !mesh.visible) return;
        meshes++;
        const geometry = mesh.geometry;
        triangles +=
          (geometry.index?.count || geometry.attributes.position.count) / 3;
        for (const attr of ["position", "normal"])
          assert.ok(
            [...geometry.attributes[attr].array].every(Number.isFinite),
          );
      });
      assert.ok(meshes <= 30, `draw count ${meshes}`);
      assert.ok(triangles < 6000, `triangle count ${triangles}`);
      // Yaw and pitch still act on the procedural weapon through the existing pivots.
      const before = view.gun.localToWorld(new T.Vector3(-0.5, 0, 0));
      view.turret.rotation.y = Math.PI / 2;
      view.gun.rotation.z = -0.4;
      view.tank.updateMatrixWorld(true);
      assert.ok(
        view.gun.localToWorld(new T.Vector3(-0.5, 0, 0)).distanceTo(before) >
          0.1,
      );
      view.dispose();
    }
});
test("procedural weapons have distinct silhouettes without external geometry", () => {
  const browser = context(),
    signatures = new Set();
  assert.equal(browser.TankBlasterMeshes, undefined);
  for (const weaponType of Object.keys(C.WEAPONS)) {
    const view = browser.createTankModel(T, { tankType: "medium", weaponType });
    view.tank.updateMatrixWorld(true);
    const size = new T.Box3().setFromObject(view.gun).getSize(new T.Vector3());
    signatures.add([size.x, size.y, size.z].map((v) => v.toFixed(3)).join(","));
    assert.ok(view.gun.children.some((mesh) => mesh.material === view.glow));
    view.dispose();
  }
  assert.equal(signatures.size, Object.keys(C.WEAPONS).length);
});
test("removed model assets are not published and weapon code is obfuscated", () => {
  const release = require("../scripts/client-release.cjs"),
    { assetPath } = require("../server.js");
  for (const file of [
    "client/art/blasters.js",
    "client/art/KENNEY-LICENSE.txt",
  ]) {
    assert.ok(!release.files.includes(file));
    assert.equal(assetPath("/" + file), null);
    assert.equal(assetPath("/" + file, { mode: "release" }), null);
  }
  for (const file of manifest.plugins.filter((file) =>
    file.startsWith("plugins/weapons/"),
  ))
    assert.equal(release.shouldObfuscate(file), true);
});
test('seven original zombie variants have distinct silhouettes, bounded geometry and owned resources', () => {
  const browser=context(), signatures=new Set();
  for(const zombieType of Object.keys(C.ZOMBIE_SPECS)) {
    const v=browser.createTankModel(T,{tankType:'zombie',weaponType:'standard',zombieType});
    let triangles=0,meshes=0;const resources=new Set();
    v.tank.updateMatrixWorld(true);
    v.tank.traverse(m=>{
      if(m.geometry) resources.add(m.geometry);
      if(m.material) resources.add(m.material);
      if(!m.isMesh||!m.visible)return;
      meshes++;triangles+=(m.geometry.index?.count||m.geometry.attributes.position.count)/3;
      for(const a of Object.values(m.geometry.attributes)) assert.ok([...a.array].every(Number.isFinite));
    });
    signatures.add(triangles+':'+meshes);
    assert.ok(meshes<=20);assert.ok(triangles<4000);assert.equal(v.limbs.length,2);
    for(const resource of resources) resource.addEventListener('dispose',()=>resource.disposed=true);
    v.dispose();assert.ok([...resources].every(r=>r.disposed));
  }
  assert.equal(signatures.size,7);
});
