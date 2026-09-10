const { test } = require("node:test"),
  assert = require("node:assert/strict"),
  fs = require("node:fs"),
  path = require("node:path"),
  vm = require("node:vm");
const C = require("../battle-core.js"),
  S = require("../battle-session.js"),
  manifest = require("../app-manifest.js"),
  { assetPath } = require("../server.js");
const ROOT = path.resolve(__dirname, "..");
test("the refactored simulation matches the pre-refactor 900 tick baseline", () => {
  const b = new C.Battle();
  b.start();
  for (let i = 0; i < 900; i++)
    b.step({
      p1: { forward: i < 120, fire: i % 180 < 100, ability: i === 30 },
    });
  const actual = b.snapshot();
  for (const entity of actual.entities) {
    assert.equal(entity.falling, false);
    for (const key of ["falling", "fallVelocity", "fallVX", "fallVZ"])
      delete entity[key];
  }
  delete actual.version;
  delete actual.pluginManifest;
  assert.deepEqual(
    actual,
    JSON.parse(
      fs.readFileSync(path.join(__dirname, "fixtures/battle-baseline.json")),
    ),
  );
});
test("one inventory covers browser dependencies, public allowlist and Docker source copies", () => {
  assert.equal(new Set(manifest.scripts).size, manifest.scripts.length);
  const docker = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  for (const file of [
    "app-manifest.js",
    "client/bootstrap.js",
    ...manifest.scripts,
  ]) {
    assert.ok(fs.existsSync(assetPath("/" + file)), file);
    if (file.startsWith("vendor/")) continue;
    assert.ok(
      docker.includes(
        file.includes("/")
          ? file.split("/")[0] + " ./" + file.split("/")[0]
          : file,
      ),
      file + " is copied",
    );
  }
  for (const file of [
    "server.js",
    "room-server.js",
    "redis-store.js",
    "plugins/catalog.js",
    "tests/architecture.test.cjs",
  ])
    assert.equal(assetPath("/" + file), null);
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  assert.deepEqual(
    [...html.matchAll(/<script src="([^"]+)"/g)].map((m) => m[1]),
    ["app-manifest.js", "client/bootstrap.js"],
  );
});
test("bootstrap loads sequentially and displays a useful error instead of continuing after failure", async () => {
  for (const fail of [false, true]) {
    const loaded = [],
      nodes = { "load-error": {}, "start-button": {} };
    const context = vm.createContext({
      window: { TankAppManifest: manifest },
      document: {
        createElement: () => ({}),
        getElementById: (id) => nodes[id],
        head: {
          appendChild(script) {
            loaded.push(script.src);
            if (fail) script.onerror();
            else script.onload();
          },
        },
      },
    });
    await vm.runInContext(
      fs.readFileSync(path.join(ROOT, "client/bootstrap.js"), "utf8"),
      context,
    );
    assert.deepEqual(
      loaded,
      fail ? [manifest.scripts[0]] : [...manifest.scripts],
    );
    if (fail) {
      assert.equal(nodes["load-error"].hidden, false);
      assert.equal(nodes["start-button"].disabled, true);
      assert.ok(nodes["load-error"].textContent.includes(manifest.scripts[0]));
    }
  }
});
test("wire state omits checkpoint internals, validates at replica, and cannot restore authority", () => {
  const a = new S.Authority(),
    r = new S.Replica();
  r.welcome(a.attach("peer", "p1"));
  a.battle.start();
  a.battle.entities[0].brain.path = Array.from({ length: 100 }, (_, i) => ({
    x: i % 50,
    z: i % 30,
  }));
  const full = a.battle.snapshot(),
    packet = a.statePacket({ network: true });
  assert.equal(packet.snapshot.pluginManifest, undefined);
  assert.ok(packet.snapshot.entities.every((e) => !Object.hasOwn(e, "brain")));
  assert.ok(
    JSON.stringify(packet.snapshot).length < JSON.stringify(full).length * 0.75,
  );
  assert.equal(r.receive(packet).ok, true);
  assert.equal(r.current.entities[0].hp, full.entities[0].hp);
  assert.throws(() => a.battle.restore(packet.snapshot), /Network state/);
  S.validateSnapshot(full);
  const copy = new C.Battle();
  copy.restore(full);
  assert.deepEqual(copy.snapshot(), full);
});
test("shared ability definitions supply plugin cooldowns, state bounds and generated docs", () => {
  for (const tank of Object.values(C.TANKS)) {
    const ability = C.ABILITIES[tank.ability];
    assert.equal(tank.abilityCooldown, ability.cooldown);
    assert.equal(tank.abilityDuration, ability.duration);
    assert.ok(C.describeAbility(tank.ability).includes(ability.name));
  }
  const source = fs.readFileSync(path.join(ROOT, "README.md"), "utf8");
  assert.equal(require("../scripts/balance-docs.cjs").update(source), source);
});
