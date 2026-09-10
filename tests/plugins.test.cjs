const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const P = require("../plugins/catalog.js"),
  C = require("../battle-core.js"),
  S = require("../battle-session.js");
const root = path.resolve(__dirname, "..");
function browser(beforeCore) {
  const context = vm.createContext({ TextEncoder });
  context.window = context;
  const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
  for (const src of require("../app-manifest.js").scripts) {
    if (
      src.startsWith("https:") ||
      src === "vendor/three.min.js" ||
      src === "battle.js"
    )
      continue;
    if (src === "core/content.js" && beforeCore) beforeCore(context);
    vm.runInContext(fs.readFileSync(path.join(root, src), "utf8"), context, {
      filename: src,
    });
  }
  return context;
}
test("browser script order registers the same plugins and protocol as Node", () => {
  const b = browser();
  assert.equal(b.TankBattle.PLUGIN_MANIFEST, C.PLUGIN_MANIFEST);
  assert.equal(new b.TankSession.LocalSession().current().entities.length, 8);
});
test("registration rejects duplicates, invalid stats and incompatible plugin APIs", () => {
  const r = P.createRegistry(),
    tank = P.tanks.light,
    weapon = P.weapons.rapid;
  r.register(tank);
  assert.throws(() => r.register(tank), /Duplicate/);
  for (const changes of [
    { apiVersion: 2 },
    { spec: { ...weapon.spec, cooldown: 0 } },
    { spec: { ...weapon.spec, delivery: "unknown" } },
    { spec: { ...weapon.spec, damage: NaN } },
  ])
    assert.throws(() => r.register({ ...weapon, ...changes }));
  r.register(weapon);
  r.seal();
  assert.throws(() => r.register({ ...tank, id: "new" }), /locked/);
  assert.ok(Object.isFrozen(r.tanks.light.spec.mount));
});
test("manifest ignores registration order but detects changed stats or versions", () => {
  function manifest(items) {
    const r = P.createRegistry();
    items.forEach((p) => r.register(p));
    return r.seal();
  }
  const t = P.tanks.medium,
    w = P.weapons.standard;
  assert.equal(manifest([t, w]), manifest([w, t]));
  assert.notEqual(manifest([t, w]), manifest([t, { ...w, version: "1.0.1" }]));
  assert.notEqual(
    manifest([t, w]),
    manifest([t, { ...w, spec: { ...w.spec, damage: 37 } }]),
  );
});
test("an additional weapon works without an ID branch in the core", () => {
  const ctx = browser((b) =>
    vm.runInContext(
      "TankPlugins.register({...TankPlugins.weapons.standard,id:'pulse',spec:{...TankPlugins.weapons.standard.spec,delivery:'ray',damage:120,range:90,cooldown:20}})",
      b,
    ),
  );
  vm.runInContext(
    `
    const session=new TankSession.LocalSession({loadout:{tankType:'light',weaponType:'pulse'}});
    session.start();const events=session.advance(1/60,{fire:true});
    if(!events.some(e=>e.type==='beam'))throw new Error('New automatic ray failed');
    if(session.current().entities[0].weaponType!=='pulse')throw new Error('Loadout lost');
    if(session.current().entities[0].cooldown!==20)throw new Error('Plugin cooldown ignored');
  `,
    ctx,
  );
});
test("plugin mismatch is rejected at welcome, snapshot and restore boundaries", () => {
  const a = new S.Authority(),
    welcome = a.attach("peer", "p1"),
    r = new S.Replica();
  assert.throws(() => r.welcome({ ...welcome, pluginManifest: "different" }));
  r.welcome(welcome);
  const state = a.statePacket();
  state.snapshot.pluginManifest = "different";
  assert.equal(r.receive(state).ok, false);
  assert.throws(() => a.battle.restore(state.snapshot));
});
test("all sixteen combinations assemble and dispose geometry via plugin visual hooks", () => {
  // A scene-graph double checks factory contracts, not WebGL appearance.
  class Vector {
    set(...args) {
      this.values = args;
    }
    setScalar(n) {
      this.values = [n, n, n];
    }
  }
  class Group {
    constructor() {
      this.children = [];
      this.position = new Vector();
      this.scale = new Vector();
      this.rotation = {};
    }
    add(o) {
      this.children.push(o);
    }
    traverse(fn) {
      fn(this);
      this.children.forEach((c) => c.traverse(fn));
    }
  }
  class Mesh extends Group {
    constructor(g, m) {
      super();
      this.geometry = g;
      this.material = m;
      this.isMesh = true;
    }
  }
  class Resource {
    constructor(options) {
      Object.assign(this, options);
    }
    dispose() {
      this.disposed = true;
    }
  }
  const T = {
    Group,
    Mesh,
    BoxGeometry: Resource,
    CylinderGeometry: Resource,
    TorusGeometry: Resource,
    SphereGeometry: Resource,
    MeshToonMaterial: Resource,
    MeshStandardMaterial: Resource,
    MeshBasicMaterial: Resource,
  };
  const ctx = browser();
  for (const tankType of Object.keys(C.TANKS))
    for (const weaponType of Object.keys(C.WEAPONS)) {
      const view = ctx.createTankModel(T, { tankType, weaponType });
      assert.equal(view.wheels.length, tankType === "human" ? 0 : 14);
      assert.ok(view.gun.children.length > 1);
      const resources = new Set();
      view.tank.traverse((o) => {
        if (o.geometry) resources.add(o.geometry);
        if (o.material) resources.add(o.material);
      });
      view.dispose();
      assert.ok([...resources].every((r) => r.disposed));
    }
});
test("cancelFire takes priority over simultaneous fire for every weapon", () => {
  for (const weaponType of Object.keys(C.WEAPONS)) {
    const b = new C.Battle({
      participants: C.defaultParticipants({
        tankType: "medium",
        weaponType,
      }).map((p) => ({ ...p, controller: "human" })),
    });
    b.start();
    assert.equal(
      b
        .step({ p1: { cancelFire: true, fire: true } })
        .filter((e) => e.type === "shot").length,
      0,
    );
    assert.equal(b.getEntity("p1").charge, 0);
  }
});
test("packet size limit counts UTF-8 bytes, including object payloads", () => {
  const raw = { text: "虎".repeat(24000) };
  assert.throws(() => S.decode(raw), /too large/);
  assert.throws(() => S.decode(JSON.stringify(raw)), /too large/);
});
