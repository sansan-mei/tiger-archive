const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const C = require("../battle-core.js");
function battle(offset) {
  const map = C.clone(C.MAP);
  map.obstacles = [];
  const b = new C.Battle({
    map,
    participants: [
      {
        id: "p1",
        controller: "human",
        tankType: "medium",
        weaponType: "laser",
        spawn: 0,
      },
      {
        id: "p2",
        controller: "human",
        tankType: "human",
        weaponType: "standard",
        spawn: 1,
      },
    ],
  });
  Object.assign(b.entities[0], { x: 10, z: offset, aim: 0, pitch: 0 });
  Object.assign(b.entities[1], { x: -10, z: 0 });
  b.start();
  return b;
}
test("widened laser catches near misses but not targets outside its radius", () => {
  const b = battle(0.9),
    p = b.entities[0];
  assert.equal(
    b.collision({ x: 10, y: 2.2, z: 0.9 }, { x: -20, y: 2.2, z: 0.9 }, "p1"),
    null,
  );
  b.shoot(p);
  assert.equal(b.entities[1].alive, false);
  assert.equal(b.events.find((e) => e.type === "beam").radius, 0.45);
  const miss = battle(1.2);
  miss.shoot(miss.entities[0]);
  assert.equal(miss.entities[1].hp, 80);
});
test("wider laser is stopped by walls and the ramp shell", () => {
  const b = battle(0.9);
  b.map.obstacles.push({ id: "wall", floor: 0, x: 0, z: 0, w: 1, d: 6, h: 4 });
  b.shoot(b.entities[0]);
  assert.equal(b.entities[1].hp, 80);
  assert.equal(b.events.find((e) => e.type === "impact").kind, "cover");
  const ramp = C.MAP.ramps[0];
  assert.equal(
    b.collision(
      { x: ramp.a.x, y: 1, z: 16 },
      { x: ramp.a.x, y: 10, z: 16 },
      null,
      { bodies: false, radius: 0.45 },
    ).kind,
    "ramp",
  );
});
test("laser penetrates every aligned tank before stopping at solid cover", () => {
  const map = C.clone(C.MAP);
  map.ramps = [];
  map.obstacles = [{ id: "wall", floor: 0, x: 0, z: 0, w: 1, d: 6, h: 4 }];
  const b = new C.Battle({
    map,
    participants: [
      { id: "p1", controller: "human", tankType: "medium", weaponType: "laser", spawn: 0 },
      { id: "p2", controller: "human", tankType: "human", weaponType: "standard", spawn: 1 },
      { id: "p3", controller: "human", tankType: "human", weaponType: "standard", spawn: 2 },
      { id: "p4", controller: "human", tankType: "human", weaponType: "standard", spawn: 3 },
    ],
  });
  Object.assign(b.entities[0], { x: 30, z: 0, aim: 0, pitch: 0 });
  Object.assign(b.entities[1], { x: 15, z: 0 });
  Object.assign(b.entities[2], { x: 5, z: 0 });
  Object.assign(b.entities[3], { x: -15, z: 0 });
  b.start();

  b.shoot(b.entities[0]);

  assert.deepEqual(
    b.entities.slice(1).map(({ hp, alive }) => ({ hp, alive })),
    [
      { hp: 0, alive: false },
      { hp: 0, alive: false },
      { hp: 80, alive: true },
    ],
  );
  assert.deepEqual(
    b.events.filter((e) => e.type === "impact").map(({ kind, targetId }) => ({ kind, targetId })),
    [
      { kind: "tank", targetId: "p2" },
      { kind: "tank", targetId: "p3" },
      { kind: "cover", targetId: null },
    ],
  );
  assert.ok(b.events.find((e) => e.type === "beam").to.x > 0);
});
test("target highlighting restores paint and ignores invisible shields, walls and dead targets", () => {
  const T = require("three");
  class Element {
    constructor() {
      this.children = [];
      this.style = {};
      this.dataset = {};
    }
    append(...x) {
      this.children.push(...x);
    }
    appendChild(x) {
      this.children.push(x);
    }
    remove() {}
  }
  const ctx = vm.createContext({
    window: { innerWidth: 1280, innerHeight: 800, TankBattle: C },
    document: { createElement: () => new Element() },
  });
  for (const file of [
    "core/abilities.js",
    "plugins/registry.js",
    "plugins/tanks/common.js",
    ...require("../app-manifest.js").plugins,
    "tank-model.js",
    "client/recoil.js",
    "client/units.js",
  ])
    vm.runInContext(
      fs.readFileSync(path.join(__dirname, "..", file), "utf8"),
      ctx,
    );
  const b = battle(0),
    state = b.snapshot();
  state.entities[0].x = 20;
  state.entities[1].x = 0;
  state.entities.push({...state.entities[1],id:"zombie_0",controller:"bot",tankType:"zombie",zombieType:"walker",weaponType:"standard",alive:false,hp:0,maxHp:80,speed:0});
  const scene = new T.Scene(),
    camera = new T.PerspectiveCamera();
  const units = ctx.window.TankClient.createUnits({
    T,
    C,
    scene,
    floorGroups: [],
    labelHost: new Element(),
    sphere: new T.IcosahedronGeometry(1, 0),
    shellMat: new T.MeshBasicMaterial(),
    reduced: true,
    effects: [],
    sound() {},
    getEntities: () => state.entities,
    getPlayerId: () => "p1",
  });
  units.createViews();
  const enemy = units.views.get("p2"),
    base = enemy.paint.color.getHex();
  const update = (targetedId) =>
    units.update({
      state,
      truth: state,
      cameraFloor: 0,
      camera,
      dt: 1 / 60,
      time: 0,
      targetedId,
    });
  update("p2");
  assert.equal(enemy.paint.color.getHex(), 0xe34848);
  assert.equal(enemy.label.dataset.targeted, "true");
  update(null);
  assert.equal(enemy.paint.color.getHex(), base);
  assert.equal(enemy.label.dataset.targeted, "false");
  scene.updateMatrixWorld(true);
  const ray = new T.Raycaster(
    new T.Vector3(10, 1.7, 0),
    new T.Vector3(-1, 0, 0),
  );
  assert.equal(units.aimHit(ray, []).object.userData.entityId, "p2");
  const wall = new T.Mesh(
    new T.BoxGeometry(1, 6, 6),
    new T.MeshBasicMaterial(),
  );
  wall.position.set(5, 2, 0);
  scene.add(wall);
  scene.updateMatrixWorld(true);
  assert.equal(units.aimHit(ray, [wall]).object, wall);
  wall.visible = false;
  assert.equal(units.aimHit(ray, [wall]).object.userData.entityId, "p2");
  state.entities[1].alive = false;
  update("p2");
  assert.equal(enemy.paint.color.getHex(), base);
  assert.equal(units.aimHit(ray, []), undefined);
  const zombieState=state.entities.find(e=>e.id==="zombie_0"),zombieView=units.views.get("zombie_0");
  Object.assign(zombieState,{alive:true,hp:80,speed:3,x:4,z:4,respawnAt:1});
  update(null);
  assert.equal(zombieView.tank.visible,true);
  assert.ok(zombieView.tank.quaternion.toArray().every(Number.isFinite));
  assert.ok(zombieView.tank.position.toArray().every(Number.isFinite));
  assert.ok(zombieView.limbs.every(limb=>Number.isFinite(limb.rotation.z)));
});
test("visible beam radius matches the authoritative event", () => {
  const T = require("three"),
    ctx = vm.createContext({ window: {} });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../client/effects.js"), "utf8"),
    ctx,
  );
  const effects = [],
    system = ctx.window.TankClient.createEffects({
      T,
      scene: new T.Scene(),
      sphere: new T.IcosahedronGeometry(1, 0),
      effects,
      getAudio: () => null,
    });
  system.beam({
    from: { x: 0, y: 2, z: 0 },
    to: { x: 10, y: 2, z: 0 },
    radius: 0.45,
    power: 1,
  });
  assert.equal(effects[0].m.geometry.parameters.radiusTop, 0.45);
});
