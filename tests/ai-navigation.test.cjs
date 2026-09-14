const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../battle-core.js');

function countValidity(battle) {
  const valid = battle.valid.bind(battle);
  let calls = 0;
  battle.valid = (...args) => { calls++; return valid(...args); };
  return () => { const count = calls; calls = 0; return count; };
}

test('warm navigation reuses cells and edges without retaining mutable output paths', () => {
  const b = new C.Battle(), body = b.entities[0], count = countValidity(b);
  const target = {x: 60, z: 60};
  const cold = b.route(body, target), coldCalls = count();
  assert.ok(cold.length);
  const warm = b.route(body, target), warmCalls = count();
  assert.deepEqual(warm, cold);
  assert.ok(warmCalls < coldCalls / 10, `${warmCalls} warm / ${coldCalls} cold validity calls`);
  warm[0].x = 999;
  assert.deepEqual(b.route(body, target), cold);
  // Moving other entities does not affect static navigation clearance.
  b.entities[1].x = cold[0].x; b.entities[1].z = cold[0].z;
  assert.deepEqual(b.route(body, target), cold);
});

test('navigation invalidates edited collision data and map replacements', () => {
  const b = new C.Battle(), body = b.entities[0], count = countValidity(b);
  b.map.ramps = []; b.map.obstacles = [];
  const target = {x: 0, z: 0};
  const original = b.route(body, target); count();
  b.map.obstacles.push({id: 'new-wall', floor: 0, x: 0, z: 24, w: 12, d: 8, h: 4});
  const blocked = b.route(body, target);
  assert.ok(count() >= 3969);
  assert.notDeepEqual(blocked, original);
  assert.ok(blocked.every(p => b.valid(p.x, p.z, body.floor, body, {ignoreEntities: true})));
  b.map.obstacles[0].x = 100;
  assert.deepEqual(b.route(body, target), original);
  b.map = C.clone(b.map); count();
  assert.deepEqual(b.route(body, target), original);
  assert.ok(count() >= 3969);
});

test('navigation separates body clearance and floors, including ramp underpasses', () => {
  const b = new C.Battle(), body = b.entities[0], ramp = b.map.ramps[0];
  for (const tankType of ['human', 'heavy', 'human']) {
    Object.assign(body, {tankType, floor: 0, y: 0, x: -26.8, z: 7.6});
    const target = {x: ramp.a.x, z: body.z}, route = b.route(body, target);
    const fresh = new C.Battle({map: b.map});
    Object.assign(fresh.entities[0], body);
    assert.deepEqual(route, fresh.route(fresh.entities[0], target));
    assert.ok(route.length);
  }
  Object.assign(body, {floor: 1, y: 8, x: 22.73, z: 3.45, tankType: 'medium'});
  const route = b.route(body, {x: 11.4, z: -11});
  assert.ok(route.length);
  assert.ok(route.every(p => b.valid(p.x, p.z, 1, body, {ignoreEntities: true})));
});
