const { test } = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const T = require("three"), C = require("../battle-core.js");
function setup(reduced = false) {
  const ctx = vm.createContext({ window: { innerWidth: 1280 } });
  for (const file of ["recoil", "camera"])
    vm.runInContext(fs.readFileSync(path.join(__dirname, `../client/${file}.js`), "utf8"), ctx);
  const body = new C.Battle().entities[0];
  const camera = new T.PerspectiveCamera();
  const rig = ctx.window.TankClient.createCameraRig({ T, C, camera, reduced, getPlayerId: () => body.id });
  rig.update(body, 0, true);
  return { body, camera, rig, recoil: ctx.window.TankClient.recoil };
}
test("model recoil leaves camera position, direction and authority state unchanged", () => {
  for (const weapon of Object.keys(C.WEAPONS)) {
    const { body, camera, rig, recoil } = setup(), before = C.clone(body);
    const position = camera.position.clone(), direction = camera.getWorldDirection(new T.Vector3());
    const orbit = [rig.viewYaw, rig.viewPitch];
    let modelKick = recoil.kick(0);
    assert.ok(recoil.profiles[weapon]);
    rig.update(body, 0);
    assert.ok(camera.position.distanceTo(position) < 1e-10);
    assert.ok(camera.getWorldDirection(new T.Vector3()).distanceTo(direction) < 1e-10);
    assert.deepEqual([rig.viewYaw, rig.viewPitch], orbit);
    assert.deepEqual(body, before);
    for (let i = 0; i < 180; i++) {
      modelKick = recoil.decay(modelKick, 1 / 60, recoil.profiles[weapon].recovery);
      rig.update(body, 1 / 60);
    }
    assert.equal(modelKick, 0);
    assert.ok(camera.position.distanceTo(position) < 0.001);
  }
});
test("automatic model recoil is capped and decay is frame-rate independent", () => {
  const { recoil } = setup();
  let value = 0;
  for (let i = 0; i < 100; i++) { value = recoil.kick(value); }
  assert.ok(value <= 1.25);
  let a = 1, b = 1;
  for (let i = 0; i < 30; i++) a = recoil.decay(a, 1 / 30, 5);
  for (let i = 0; i < 120; i++) b = recoil.decay(b, 1 / 120, 5);
  assert.ok(Math.abs(a - b) < 1e-10);

});
