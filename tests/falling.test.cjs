const { test } = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../battle-core.js"),
  S = require("../battle-session.js");
function setup(type = "medium", floor = 2, side = 1) {
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
    x: 30,
    z: 40 * side,
    y: C.MAP.levels[floor].y,
    floor,
    heading: (Math.PI / 2) * side,
    aim: (Math.PI / 2) * side,
  });
  b.start();
  return { b, p };
}
function enter(b, p) {
  for (let i = 0; i < 240 && !p.falling; i++) b.step({ p1: { forward: true } });
  assert.equal(p.falling, true);
}
test("all units descend from both marked exits on both upper decks without fall damage", () => {
  for (const type of Object.keys(C.TANKS))
    for (const floor of [1, 2])
      for (const side of [-1, 1]) {
        const { b, p } = setup(type, floor, side);
        enter(b, p);
        const hp = p.hp,
          shield = p.shield;
        let last = p.y,
          landed = false;
        for (let i = 0; i < 200 && p.falling; i++) {
          const events = b.step();
          assert.ok(p.y <= last);
          last = p.y;
          landed ||= events.some((e) => e.type === "land");
          S.validateSnapshot(b.snapshot());
        }
        assert.ok(landed);
        assert.equal(p.floor, 0);
        assert.equal(p.y, 0);
        assert.equal(p.hp, hp);
        assert.equal(p.shield, shield);
        assert.ok(Math.abs(p.z) > 46);
        assert.ok(Math.abs(p.z) <= 64 - C.TANKS[type].radius);
      }
});
test("closed deck edges and ramp rails still block departure; navigation does not choose drop exits", () => {
  const { b, p } = setup();
  p.x = -10;
  for (let i = 0; i < 240; i++) b.step({ p1: { forward: true } });
  assert.equal(p.falling, false);
  assert.ok(p.z <= 46 - C.TANKS.medium.radius);
  assert.equal(b.valid(30, 46, 2, p, { ignoreEntities: true }), false);
  const r = C.MAP.ramps[0];
  Object.assign(p, {
    x: r.a.x,
    z: 16,
    y: 4,
    floor: 0,
    rampId: r.id,
    rampDir: 1,
  });
  assert.equal(b.surface(p, r.a.x + 10, 16), null);
});
test("airborne controls cannot brake, steer or boost but firing and aiming continue", () => {
  const { b, p } = setup();
  enter(b, p);
  const velocity = [p.fallVX, p.fallVZ],
    heading = p.heading;
  const events = [];
  for (let i = 0; i < 12; i++)
    events.push(
      ...b.step({
        p1: {
          reverse: true,
          left: true,
          brake: true,
          ability: true,
          fire: true,
          aimYaw: 0,
        },
      }),
    );
  assert.deepEqual([p.fallVX, p.fallVZ], velocity);
  assert.equal(p.heading, heading);
  assert.equal(p.abilityCooldown, 0);
  assert.notEqual(p.aim, heading);
  assert.ok(events.some((e) => e.type === "shot"));
});
test("midair checkpoints and network replicas preserve descent; invalid velocities are rejected", () => {
  const { b, p } = setup();
  enter(b, p);
  b.step();
  const snapshot = b.snapshot(),
    copy = new C.Battle();
  S.validateSnapshot(snapshot);
  copy.restore(snapshot);
  const authority = new S.Authority();
  authority.battle = b;
  const replica = new S.Replica();
  replica.welcome(authority.attach("peer", "p1"));
  assert.equal(
    replica.receive(authority.statePacket({ network: true })).ok,
    true,
  );
  assert.equal(replica.current.entities[0].falling, true);
  for (let i = 0; i < 150; i++) {
    b.step();
    copy.step();
  }
  assert.deepEqual(b.snapshot(), copy.snapshot());
  for (const change of [
    { fallVelocity: 1 },
    { fallVX: 100 },
    { falling: false },
    { rampId: "west-12", rampDir: 1 },
  ]) {
    const invalid = C.clone(snapshot);
    Object.assign(invalid.entities[0], change);
    assert.throws(() => S.validateSnapshot(invalid));
  }
});
test("a real intermediate deck catches falling bodies and occupied ground has a safe landing", () => {
  const { b, p } = setup();
  Object.assign(p, {
    x: 30,
    z: 40,
    y: 12,
    falling: true,
    fallVelocity: -2,
    fallVX: 0,
    fallVZ: 0,
  });
  for (let i = 0; i < 90 && p.falling; i++) b.step();
  assert.equal(p.floor, 1);
  assert.equal(p.y, 8);
  const second = setup(),
    q = second.p,
    other = second.b.entities[1];
  Object.assign(q, {
    x: 30,
    z: 55,
    y: 1,
    falling: true,
    fallVelocity: -5,
    fallVX: 0,
    fallVZ: 0,
  });
  Object.assign(other, { x: 30, z: 55 });
  for (let i = 0; i < 90 && q.falling; i++) second.b.step();
  assert.equal(q.falling, false);
  assert.ok(
    Math.hypot(q.x - other.x, q.z - other.z) >=
      C.TANKS.medium.radius * 2 + 0.25,
  );
});
test("midair destruction does not freeze the corpse and respawn clears all fall state", () => {
  const { b, p } = setup();
  enter(b, p);
  b.damage(p, 10000, "p2", p);
  assert.equal(p.alive, false);
  for (let i = 0; i < 100; i++) b.step();
  assert.equal(p.falling, false);
  assert.equal(p.y, 0);
  for (let i = 0; i < 150; i++) b.step();
  assert.equal(p.alive, true);
  assert.equal(p.falling, false);
  assert.deepEqual([p.fallVelocity, p.fallVX, p.fallVZ], [0, 0, 0]);
});
