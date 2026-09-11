const { test } = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../battle-core.js"),
  S = require("../battle-session.js");
function setup() {
  const map = C.clone(C.MAP);
  map.obstacles = [];
  const b = new C.Battle({
    map,
    participants: [
      {
        id: "a",
        controller: "human",
        tankType: "medium",
        weaponType: "standard",
        spawn: 0,
      },
      {
        id: "b",
        controller: "human",
        tankType: "heavy",
        weaponType: "rapid",
        spawn: 1,
      },
    ],
  });
  b.start();
  Object.assign(b.entities[0], { x: 0, z: 40 });
  Object.assign(b.entities[1], { x: 0, z: 10 });
  return b;
}
function fire(b) {
  const a = b.entities[0];
  a.cooldown = 0;
  assert.equal(b.shoot(a), true);
  return b.bullets.pop();
}
function hit(b, shot, kind = "tank") {
  b.resolveHit(
    {
      kind,
      id: kind === "tank" ? "b" : "wall",
      point: { x: 0, y: 2.2, z: 10 },
    },
    shot,
  );
}
test("standard cannon cycles 35,35,70; enhanced hit never charges the next cycle", () => {
  const b = setup(),
    a = b.entities[0];
  const actual = [];
  for (let i = 0; i < 9; i++) {
    Object.assign(b.entities[1], { hp: 280, shield: 0 });
    const shot = fire(b);
    actual.push(shot.damage);
    hit(b, shot);
    assert.equal(a.criticalProgress, (i + 1) % 3);
    assert.equal(
      b.events.filter((e) => e.type === "damage").at(-1).critical,
      i % 3 === 2,
    );
  }
  assert.deepEqual(actual, [35, 35, 70, 35, 35, 70, 35, 35, 70]);
  assert.equal(
    actual.reduce((a, b) => a + b),
    420,
  );
});
test("walls and protected targets do not charge; a missed enhanced shot consumes readiness", () => {
  const b = setup(),
    a = b.entities[0],
    target = b.entities[1];
  hit(b, fire(b), "cover");
  assert.equal(a.criticalProgress, 0);
  target.protectedUntil = 100;
  hit(b, fire(b));
  assert.equal(a.criticalProgress, 0);
  target.protectedUntil = 0;
  hit(b, fire(b));
  hit(b, fire(b));
  assert.equal(a.criticalProgress, 2);
  const enhanced = fire(b);
  assert.equal(enhanced.critical, true);
  assert.equal(a.criticalProgress, 0);
  hit(b, enhanced, "cover");
  assert.equal(fire(b).damage, 35);
});
test("temporary barrier hits count, cancelled fire does not consume readiness, and death clears progress", () => {
  const b = setup(),
    a = b.entities[0],
    target = b.entities[1];
  target.tankType = "medium";
  target.hp = target.maxHp = 210;
  b.step({ b: { ability: true } });
  hit(b, fire(b));
  assert.equal(target.hp, 210);
  assert.equal(target.barrier, 25);
  assert.equal(a.criticalProgress, 1);
  hit(b, fire(b));
  b.releaseControl("a");
  assert.equal(a.criticalProgress, 2);
  assert.equal(b.shoot(a), false);
  assert.equal(a.criticalProgress, 2); // still cooling down
  b.damage(a, 1000, "b", a);
  assert.equal(a.criticalProgress, 0);
});
test("a projectile from a previous life cannot charge its respawned owner", () => {
  const b = setup(),
    a = b.entities[0],
    old = fire(b);
  b.damage(a, 1000, "b", a);
  for (let i = 0; i < C.RULES.respawn; i++) b.step({});
  assert.equal(a.alive, true);
  assert.equal(a.criticalProgress, 0);
  hit(b, old);
  assert.equal(a.criticalProgress, 0);
});
test("ready state and in-flight enhanced ammo survive checkpoint and network projection with validation", () => {
  const b = setup(),
    a = b.entities[0];
  hit(b, fire(b));
  hit(b, fire(b));
  const ready = b.snapshot();
  S.validateSnapshot(ready);
  assert.equal(b.networkSnapshot().entities[0].criticalProgress, 2);
  const copy = new C.Battle({ map: b.map });
  copy.restore(ready);
  const shot = fire(copy);
  assert.equal(shot.damage, 70);
  copy.bullets.push(shot);
  const state = copy.snapshot();
  S.validateSnapshot(state);
  S.validateSnapshot(copy.networkSnapshot(), { network: true });
  const restored = new C.Battle({ map: b.map });
  restored.restore(state);
  assert.deepEqual(restored.snapshot(), state);
  for (const mutate of [
    (s) => (s.entities[0].criticalProgress = 3),
    (s) => (s.entities[1].criticalProgress = 1),
    (s) => (s.bullets[0].damage = 71),
    (s) => (s.bullets[0].critical = false),
    (s) => (s.bullets[0].ownerLife = 99),
  ]) {
    const bad = C.clone(state);
    mutate(bad);
    assert.throws(() => S.validateSnapshot(bad));
  }
  assert.throws(() => C.normalizeInput({ criticalProgress: 2 }));
  assert.throws(() => C.normalizeInput({ critical: true }));
});
