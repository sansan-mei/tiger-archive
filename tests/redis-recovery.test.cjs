const { test } = require("node:test"),
  assert = require("node:assert/strict");
const {
  RedisStore,
  SAVE_SCRIPT,
  RELEASE_SCRIPT,
  RESET_SCRIPT,
  DEFAULT_PREFIX,
} = require("../redis-store.js");
const { RoomServer } = require("../room-server.js");
const C = require("../battle-core.js");
function savedRoom() {
  const rooms = new RoomServer({ now: () => 100 });
  const id = rooms.connect({ bufferedAmount: 0, send() {}, close() {} });
  rooms.receive(
    id,
    JSON.stringify({
      type: "create",
      version: C.VERSION,
      pluginManifest: C.PLUGIN_MANIFEST,
      name: "Pilot",
      loadout: { tankType: "medium", weaponType: "standard" },
    }),
  );
  assert.equal(rooms.rooms.size, 1);
  return rooms.checkpoint();
}
function redis(raw) {
  const values = new Map(),
    ttl = new Map();
  if (raw !== null) values.set(DEFAULT_PREFIX + ":checkpoint", raw);
  const client = {
    isOpen: false,
    beforeEval: null,
    async connect() {
      this.isOpen = true;
    },
    async set(k, v, options) {
      assert.equal(options.NX, true);
      if (values.has(k)) return null;
      values.set(k, v);
      return "OK";
    },
    async get(k) {
      return values.get(k) ?? null;
    },
    async eval(script, { keys, arguments: a }) {
      this.beforeEval?.(script);
      if (values.get(keys[0]) !== a[0]) return 0;
      if (script === RESET_SCRIPT) {
        if (values.get(keys[1]) !== a[1]) return -1;
        values.set(keys[2], a[1]);
        ttl.set(keys[2], 86400);
        values.set(keys[1], a[2]);
        ttl.set(keys[1], 86400);
        ttl.set(keys[0], 15);
        return 1;
      }
      if (script === SAVE_SCRIPT) {
        values.set(keys[1], a[1]);
        ttl.set(keys[1], 86400);
        ttl.set(keys[0], 15);
        return 1;
      }
      assert.equal(script, RELEASE_SCRIPT);
      values.delete(keys[0]);
      return 1;
    },
    destroy() {
      this.isOpen = false;
    },
  };
  return { client, values, ttl, store: new RedisStore(client) };
}
test("compatible room recovery preserves seats and refreshes checkpoint under a stable prefix", async () => {
  const original = savedRoom(),
    r = redis(JSON.stringify(original)),
    rooms = new RoomServer({ now: () => 500 });
  assert.deepEqual(await r.store.recover(rooms), { status: "restored" });
  assert.equal(rooms.rooms.size, 1);
  const room = [...rooms.rooms.values()][0];
  assert.equal(room.seats[0].token, original.rooms[0].seats[0].token);
  assert.equal(room.seats[0].clientId, null);
  assert.equal(r.values.has(DEFAULT_PREFIX + ":checkpoint:previous"), false);
  assert.equal(
    JSON.parse(r.values.get(DEFAULT_PREFIX + ":checkpoint")).savedAt,
    500,
  );
  await r.store.close();
});
test("protocol or plugin mismatch backs up exact old bytes for 24h and replaces them with an empty current lobby", async () => {
  for (const field of ["version", "pluginManifest"]) {
    const old = savedRoom();
    old[field] = field === "version" ? C.VERSION - 1 : "old-plugins";
    const raw = JSON.stringify(old),
      r = redis(raw),
      rooms = new RoomServer();
    const result = await r.store.recover(rooms);
    assert.deepEqual(result, {
      status: "reset",
      backupKey: DEFAULT_PREFIX + ":checkpoint:previous",
    });
    assert.equal(r.values.get(result.backupKey), raw);
    assert.equal(r.ttl.get(result.backupKey), 86400);
    assert.equal(rooms.rooms.size, 0);
    const current = JSON.parse(r.values.get(DEFAULT_PREFIX + ":checkpoint"));
    assert.equal(current.version, C.VERSION);
    assert.deepEqual(current.rooms, []);
    await r.store.close();
    const second = new RedisStore(r.client);
    assert.deepEqual(await second.recover(new RoomServer()), {
      status: "restored",
    });
    assert.equal(r.values.get(result.backupKey), raw);
    await second.close();
  }
});
test("missing checkpoint starts empty; malformed JSON or corrupt current data are not auto-deleted", async () => {
  const empty = redis(null);
  assert.deepEqual(await empty.store.recover(new RoomServer()), {
    status: "empty",
  });
  await empty.store.close();
  const corrupt = savedRoom();
  corrupt.rooms[0].phase = "invalid";
  for (const raw of [
    "{broken",
    "null",
    "false",
    '{"version":1,"pluginManifest":"old","rooms":{}}',
    JSON.stringify(corrupt),
  ]) {
    const r = redis(raw);
    await assert.rejects(() => r.store.recover(new RoomServer()));
    assert.equal(r.values.get(DEFAULT_PREFIX + ":checkpoint"), raw);
    assert.equal(r.values.has(DEFAULT_PREFIX + ":checkpoint:previous"), false);
    r.store.abort();
  }
});
test("a lost lease, changed checkpoint or Redis failure blocks reset without clobbering data", async () => {
  for (const mode of ["lease", "changed", "failure"]) {
    const old = savedRoom();
    old.version--;
    const raw = JSON.stringify(old),
      r = redis(raw);
    r.client.beforeEval = (script) => {
      assert.equal(script, RESET_SCRIPT);
      if (mode === "lease")
        r.values.set(DEFAULT_PREFIX + ":lease", "new-owner");
      else if (mode === "changed")
        r.values.set(DEFAULT_PREFIX + ":checkpoint", "new-value");
      else throw Error("Redis unavailable");
    };
    await assert.rejects(() => r.store.recover(new RoomServer()));
    assert.equal(
      r.values.get(DEFAULT_PREFIX + ":checkpoint"),
      mode === "changed" ? "new-value" : raw,
    );
    assert.equal(r.values.has(DEFAULT_PREFIX + ":checkpoint:previous"), false);
    r.store.abort();
  }
});
test("a live owner blocks recovery; backup replacement uses one bounded key and untouched unrelated keys", async () => {
  const old = savedRoom();
  old.version--;
  const r = redis(JSON.stringify(old));
  r.values.set("other:checkpoint", "untouched");
  r.values.set(DEFAULT_PREFIX + ":checkpoint:previous", "older-backup");
  await r.store.recover(new RoomServer());
  const backup = r.values.get(DEFAULT_PREFIX + ":checkpoint:previous");
  assert.notEqual(backup, "older-backup");
  await assert.rejects(
    () => new RedisStore(r.client).recover(new RoomServer()),
    /Another/,
  );
  assert.equal(r.values.get(DEFAULT_PREFIX + ":checkpoint:previous"), backup);
  assert.equal(r.values.get("other:checkpoint"), "untouched");
  await r.store.close();
});
