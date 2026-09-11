const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const C = require("../battle-core.js"),
  S = require("../battle-session.js");
function setup(type, r) {
  const b = new C.Battle({
    participants: [
      {
        id: "p1",
        controller: "human",
        tankType: type,
        weaponType: "rocket",
        spawn: 0,
      },
      {
        id: "p2",
        controller: "human",
        tankType: "medium",
        weaponType: "standard",
        spawn: 1,
      },
    ],
  });
  const p = b.entities[0];
  Object.assign(p, {
    x: r.a.x - Math.sign(r.a.x) * 9.2,
    z: r.a.z + (r.b.z - r.a.z) * 0.8,
    floor: r.a.floor,
    y: C.MAP.levels[r.a.floor].y,
    heading: r.a.x < 0 ? 0 : Math.PI,
    aim: r.a.x < 0 ? 0 : Math.PI,
  });
  b.start();
  return { b, p };
}
test("all four units drive underneath every ramp, reverse out, and keep flat state", () => {
  for (const type of Object.keys(C.PLAYER_TANKS))
    for (const r of C.MAP.ramps) {
      const { b, p } = setup(type, r);
      let passed = false;
      for (let i = 0; i < 180; i++) {
        b.step({ p1: { forward: true } });
        assert.equal(p.rampId, null);
        assert.equal(p.y, C.MAP.levels[r.a.floor].y);
        if (Math.abs(p.x - r.a.x) < 0.2) {
          passed = true;
          break;
        }
      }
      assert.ok(passed, type + " " + r.id);
      const copy = new C.Battle();
      S.validateSnapshot(b.snapshot());
      copy.restore(b.snapshot());
      for (let i = 0; i < 360; i++) {
        const input = { p1: { reverse: true } };
        b.step(input);
        copy.step(input);
      }
      assert.deepEqual(copy.snapshot(), b.snapshot());
      assert.equal(p.rampId, null);
      assert.ok(
        Math.abs(p.x - r.a.x) > r.width / 2 + C.TANKS[type].radius,
        type + " " + r.id + " x=" + p.x,
      );
    }
});
test("insufficient clearance blocks the entire footprint, including flat-surface validation and slope underside approaches", () => {
  const r = C.MAP.ramps[0],
    { b, p } = setup("heavy", r);
  const low = r.a.z + (r.b.z - r.a.z) * 0.4;
  assert.equal(b.surface(p, r.a.x, low), null);
  const invalid = b.snapshot();
  Object.assign(invalid.entities[0], { x: r.a.x, z: low });
  assert.throws(() => S.validateSnapshot(invalid), /clearance/);
  assert.equal(
    b.valid(r.a.x, low, r.a.floor, p, { surface: { y: 0, rampId: null } }),
    false,
  );
  const human = setup("human", r),
    mid = r.a.z + (r.b.z - r.a.z) * 0.48;
  assert.ok(human.b.surface(human.p, r.a.x, mid));
  assert.equal(b.surface(p, r.a.x, mid), null);
  // Driving towards the descending ceiling stops, rather than snapping onto it.
  Object.assign(p, { x: r.a.x, heading: Math.PI / 2 });
  for (let i = 0; i < 180; i++) b.step({ p1: { forward: true } });
  assert.equal(p.rampId, null);
  assert.equal(p.y, 0);
  assert.ok(
    C.rampCeiling(b.map, r, p.x, p.z, C.TANKS.heavy.radius) >= 3.1 - 1e-8,
  );
});
test("ramp top and underpass bodies coexist; fire travels below and is stopped by the ramp shell", () => {
  const r = C.MAP.ramps[0],
    { b, p } = setup("medium", r);
  p.x = r.a.x;
  const top = b.entities[1];
  Object.assign(top, {
    x: p.x,
    z: p.z,
    y: C.rampHeight(b.map, r, p.z),
    floor: r.a.floor,
    rampId: r.id,
    rampDir: 1,
  });
  assert.equal(
    b.valid(p.x, p.z, p.floor, p, { surface: b.surface(p, p.x, p.z) }),
    true,
  );
  assert.equal(
    b.collision(
      { x: p.x - 10, y: 2.2, z: p.z },
      { x: p.x + 10, y: 2.2, z: p.z },
      null,
      { bodies: false },
    ),
    null,
  );
  assert.equal(
    b.collision({ x: p.x, y: 2.2, z: p.z }, { x: p.x, y: 9, z: p.z }, null, {
      bodies: false,
    }).kind,
    "ramp",
  );
  b.shoot(p);
  assert.ok(b.bullets.length);
  for (let i = 0; i < 30; i++) b.step();
  assert.equal(top.hp, top.maxHp);
  const a = new S.Authority();
  a.battle = b;
  const replica = new S.Replica();
  replica.welcome(a.attach("peer", "p1"));
  assert.equal(replica.receive(a.statePacket({ network: true })).ok, true);
});
test("AI navigation accepts the high underpass while retaining low ceiling avoidance", () => {
  const r = C.MAP.ramps[0],
    { b, p } = setup("medium", r);
  const route = b.route(p, { x: r.a.x, z: p.z });
  assert.ok(route.length);
  assert.ok(route.some((q) => Math.abs(q.x - r.a.x) < r.width / 2));
  for (const point of route)
    assert.ok(
      b.valid(point.x, point.z, p.floor, p, {
        ignoreEntities: true,
        margin: 0.5,
      }),
    );
});
test("camera stays below the ramp ceiling", () => {
  const T = require("three"),
    r = C.MAP.ramps[0],
    { p } = setup("medium", r);
  p.x = r.a.x;
  const context = vm.createContext({ window: { innerWidth: 1280 } });
  vm.runInContext(fs.readFileSync(path.join(__dirname, "../client/recoil.js"), "utf8"), context);
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../client/camera.js"), "utf8"),
    context,
  );
  const camera = new T.PerspectiveCamera();
  const rig = context.window.TankClient.createCameraRig({
    T,
    C,
    camera,
    reduced: true,
    getPlayerId: () => p.id,
  });
  rig.viewPitch = 1;
  rig.update(p, 1);
  const b = new C.Battle();
  assert.equal(
    b.collision({ x: p.x, y: p.y + 3.2, z: p.z }, camera.position, null, {
      bodies: false,
    }),
    null,
  );
  assert.ok(
    camera.position.y < C.rampHeight(C.MAP, r, camera.position.z) - 0.6,
  );
});
