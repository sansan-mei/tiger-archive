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
    "client/art/blasters.js",
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
  for (const tankType of Object.keys(C.TANKS))
    for (const weaponType of Object.keys(C.WEAPONS)) {
      const view = browser.createTankModel(T, { tankType, weaponType });
      view.tank.updateMatrixWorld(true);
      const asset = view.gun.children.find((mesh) =>
        mesh.name.startsWith("kenney-blaster-"),
      );
      assert.ok(asset);
      const bounds = new T.Box3().setFromObject(asset);
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
      assert.ok(meshes <= 26, `draw count ${meshes}`);
      assert.ok(triangles < 5000, `triangle count ${triangles}`);
      // Yaw and pitch still act on the imported mesh through the existing pivots.
      const before = asset.getWorldPosition(new T.Vector3());
      view.turret.rotation.y = Math.PI / 2;
      view.gun.rotation.z = -0.4;
      view.tank.updateMatrixWorld(true);
      assert.ok(
        asset.getWorldPosition(new T.Vector3()).distanceTo(before) > 0.1,
      );
      view.dispose();
    }
});
test("imported blasters contain valid indexed, normalized geometry and baked palette colors", () => {
  const meshes = context().TankBlasterMeshes;
  assert.deepEqual(Object.keys(meshes).sort(), ["b", "h", "j", "r"]);
  for (const mesh of Object.values(meshes)) {
    assert.equal(mesh.positions.length, mesh.normals.length);
    assert.equal(mesh.colors.length, mesh.positions.length);
    assert.equal(mesh.indices.length % 3, 0);
    assert.ok(
      mesh.indices.every(
        (i) => Number.isInteger(i) && i >= 0 && i < mesh.positions.length / 3,
      ),
    );
    assert.ok(
      mesh.colors.every((v) => Number.isInteger(v) && v >= 0 && v <= 255),
    );
    const xs = mesh.positions.filter((_, i) => i % 3 === 0);
    assert.equal(Math.min(...xs), -1);
    assert.equal(Math.max(...xs), 0);
  }
});
test("art data ships in source and release inventories with provenance and no obfuscation", () => {
  const asset = "client/art/blasters.js",
    release = require("../scripts/client-release.cjs");
  const { assetPath } = require("../server.js");
  assert.ok(
    manifest.scripts.indexOf(asset) < manifest.scripts.indexOf("tank-model.js"),
  );
  assert.ok(release.files.includes(asset));
  assert.equal(release.shouldObfuscate(asset), false);
  assert.equal(release.shouldObfuscate("tank-model.js"), true);
  assert.equal(assetPath("/" + asset), path.resolve(__dirname, "..", asset));
  assert.equal(
    assetPath("/" + asset, { mode: "release" }),
    path.resolve(__dirname, "../public-dist", asset),
  );
  assert.match(
    fs.readFileSync(
      path.join(__dirname, "../client/art/KENNEY-LICENSE.txt"),
      "utf8",
    ),
    /Creative Commons Zero/,
  );
});
