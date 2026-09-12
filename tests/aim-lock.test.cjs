const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
function setup() {
  const ctx = vm.createContext({ window: {} });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../client/aim-assist.js"), "utf8"),
    ctx,
  );
  const assist = ctx.window.TankClient.createAimAssist();
  const args = {
    time: 0,
    inputRevision: 0,
    enabled: true,
    player: { id: "self", x: 0, y: 0, z: 0 },
    entities: [{ id: "enemy", x: 8, y: 0, z: 10, height: 2.8, alive: true }],
    hitId: "enemy",
    range: 140,
    project: (p) => ({
      x: 50 + p.x,
      y: 50,
      distance: Math.abs(p.x),
      visible: true,
    }),
    visible: () => true,
  };
  assist.update(args);
  return {
    assist,
    args,
    run: (change = {}) => assist.update({ ...args, time: 200, ...change }),
  };
}
test("stationary aim acquires the red target and follows its body center without changing fire input", () => {
  const { run, args } = setup();
  assert.equal(run({ time: 100 }), null);
  const locked = run();
  assert.equal(locked.id, "enemy");
  assert.equal(locked.point.y, 1.68);
  args.entities[0].x = 40;
  const tracked = run({ time: 216 });
  assert.equal(tracked.point.x, 40);
  assert.ok(!Object.hasOwn(tracked, "fire"));
});
test("actual mouse movement releases immediately and prevents instant reacquisition", () => {
  const { run, args } = setup();
  assert.ok(run());
  assert.equal(run({ time: 201, inputRevision: 1 }), null);
  assert.equal(run({ time: 220, inputRevision: 1 }), null);
  assert.ok(run({ time: 400, inputRevision: 1 }));
  args.entities[0].x = 100;
  assert.equal(run({ time: 416, inputRevision: 1 }), null);
});
test("occlusion, death, range and pause release the lock", () => {
  for (const change of [
    { visible: () => false },
    { entities: [] },
    { range: 3 },
    { enabled: false },
    { project: () => ({ visible: false, distance: 0 }) },
  ]) {
    const { run } = setup();
    assert.ok(run());
    assert.equal(run({ time: 216, ...change }), null);
  }
  const { run, args } = setup();
  assert.ok(run());
  args.entities[0].alive = false;
  assert.equal(run({ time: 216 }), null);
});
test("acquisition rejects distant screen candidates before visibility raycasts", () => {
  const { run, args } = setup();
  args.hitId=null;
  for(const x of [20,40,60,80])args.entities.push({id:"far"+x,x,y:0,z:10,height:3,alive:true});
  let calls=0;
  const target=run({visible:()=>{calls++;return true;}});
  assert.equal(target.id,"enemy");
  assert.equal(calls,1);
});
test("acquisition stays small, prioritizes direct hits and does not switch a held target", () => {
  const { run, args } = setup();
  args.entities.push({
    id: "nearby",
    x: 1,
    y: 0,
    z: 10,
    height: 3,
    alive: true,
  });
  assert.equal(run().id, "enemy");
  assert.equal(run({ time: 216, hitId: "nearby" }).id, "enemy");
  const fresh = setup();
  fresh.args.entities[0].x = 40;
  assert.equal(fresh.run({ hitId: null }), null);
  assert.ok(fresh.run({ hitId: "enemy" }));
});
