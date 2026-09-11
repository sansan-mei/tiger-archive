const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { Writable } = require("node:stream"),
  { EventEmitter } = require("node:events");
const { createApp, assetPath, originAllowed } = require("../server.js");
const { RedisStore, SAVE_SCRIPT } = require("../redis-store.js");
test("static allowlist excludes secrets, server source and traversal", () => {
  for (const url of [
    "/.env",
    "/server.js",
    "/package-lock.json",
    "/plugins/catalog.js",
    "/%2e%2e/.env",
    "/plugins/tanks/../../../.env",
  ])
    assert.equal(assetPath(url), null);
  assert.match(assetPath("/vendor/three.min.js"), /node_modules/);
  assert.match(assetPath("/"), /index.html$/);
});
test("upgrade accepts only matching origin or configured public origin", () => {
  assert.equal(
    originAllowed(
      { headers: { origin: "http://localhost:8080", host: "localhost:8080" } },
      "",
    ),
    true,
  );
  assert.equal(
    originAllowed(
      { headers: { origin: "https://evil.test", host: "game.test" } },
      "",
    ),
    false,
  );
  assert.equal(originAllowed({ headers: { host: "game.test" } }, ""), false);
  assert.equal(
    originAllowed(
      { headers: { origin: "https://game.test", host: "tank:8080" } },
      "https://game.test",
    ),
    true,
  );
});
test("HTTP adapter serves health and bundled Three.js without opening a listener", async () => {
  const app = createApp();
  async function request(url) {
    const chunks = [];
    let data = "",
      status,
      headers = {};
    const res = new Writable({
      write(chunk, encoding, done) {
        data += chunk.toString();
        chunks.push(Buffer.from(chunk));
        done();
      },
    });
    res.setHeader = (k, v) => {
      headers[k] = v;
    };
    res.writeHead = (s, h = {}) => {
      status = s;
      Object.assign(headers, h);
    };
    const end = new Promise((resolve) => res.on("finish", resolve));
    app.server.emit("request", { url, method: "GET" }, res);
    await end;
    return { data, status, headers, bytes: Buffer.concat(chunks) };
  }
  assert.equal((await request("/healthz")).status, 200);
  app.rooms.rooms.set("ABCDEF", {
    code: "ABCDEF",
    phase: "lobby",
    host: "p1",
    seats: [{ id: "p1", name: "车长", token: "secret", clientId: "private" }],
  });
  const directory = await request("/api/rooms");
  assert.equal(directory.status, 200);
  assert.equal(directory.headers["Cache-Control"], "no-store");
  assert.deepEqual(JSON.parse(directory.data), {
    version: require("../battle-core.js").VERSION,
    rooms: [
      {
        code: "ABCDEF",
        mode: "pvp",
        hostName: "车长",
        players: 1,
        capacity: 8,
        phase: "lobby",
        joinable: true,
      },
    ],
  });
  app.rooms.rooms.clear();
  const asset = await request("/vendor/three.min.js");
  assert.equal(asset.status, 200);
  assert.ok(asset.data.length > 100000);
  assert.equal((await request("/.env")).status, 404);
  const scenery = await request("/client/environment/maintenance-kit.json");
  assert.equal(scenery.status, 200);
  assert.equal(
    scenery.headers["Content-Type"],
    "application/json; charset=utf-8",
  );
  assert.deepEqual(
    JSON.parse(scenery.data),
    require("../client/environment/maintenance-kit.json"),
  );
  assert.ok(
    require("../scripts/client-release.cjs").files.includes(
      "client/environment/maintenance-kit.json",
    ),
  );
  assert.equal((await request("/art/maintenance-base.blend")).status, 404);
  const arsenal = await request("/client/models/arsenal.json");
  assert.equal(arsenal.status, 200);
  assert.equal(
    arsenal.headers["Content-Type"],
    "application/json; charset=utf-8",
  );
  assert.deepEqual(
    JSON.parse(arsenal.data),
    require("../client/models/arsenal.json"),
  );
  assert.ok(
    require("../scripts/client-release.cjs").files.includes(
      "client/models/arsenal.json",
    ),
  );
  assert.equal((await request("/art/arsenal.blend")).status, 404);
  const recording = await request("/client/audio/tank-drive.mp3");
  assert.equal(recording.status, 200);
  assert.equal(recording.headers["Content-Type"], "audio/mpeg");
  assert.deepEqual(
    recording.bytes,
    require("node:fs").readFileSync(assetPath("/client/audio/tank-drive.mp3")),
  );
  assert.ok(
    require("../scripts/client-release.cjs").files.includes(
      "client/audio/tank-drive.mp3",
    ),
  );
  app.close();
});
test("WebSocket adapter routes text and disconnect; binary frames are rejected", () => {
  const app = createApp();
  class WS extends EventEmitter {
    constructor() {
      super();
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.messages = [];
    }
    send(s) {
      this.messages.push(JSON.parse(s));
    }
    close(code) {
      this.code = code;
      this.emit("close");
    }
    terminate() {}
  }
  const ws = new WS();
  app.wss.emit("connection", ws);
  ws.emit("message", Buffer.from('{"type":"ping","sentAt":1}'), false);
  assert.equal(ws.messages[0].type, "pong");
  ws.emit("message", Buffer.from("x"), true);
  assert.equal(ws.code, 1003);
  assert.equal(app.rooms.clients.size, 0);
  app.close();
});
test("Redis ownership, save and release do not overwrite another owner", async () => {
  const values = new Map();
  const client = {
    isOpen: false,
    async connect() {
      this.isOpen = true;
    },
    async set(k, v) {
      if (values.has(k)) return null;
      values.set(k, v);
      return "OK";
    },
    async get(k) {
      return values.get(k) || null;
    },
    async eval(script, { keys, arguments: args }) {
      if (values.get(keys[0]) !== args[0]) return 0;
      if (script === SAVE_SCRIPT) {
        values.set(keys[1], args[1]);
        return 1;
      }
      values.delete(keys[0]);
      return 1;
    },
    destroy() {
      this.isOpen = false;
    },
  };
  const store = new RedisStore(client);
  assert.equal(await store.open(), null);
  await store.save({ rooms: [] });
  assert.equal(values.get(store.prefix + ":checkpoint"), '{"rooms":[]}');
  const other = new RedisStore(client);
  await assert.rejects(() => other.open(), /Another/);
  values.set(store.prefix + ":lease", "new-owner");
  await assert.rejects(() => store.save({ rooms: ["wrong"] }), /lease lost/);
  await store.close();
  assert.equal(values.get(store.prefix + ":lease"), "new-owner");
});
test("Redis command stall fails within configured timeout", async () => {
  const store = new RedisStore(
    { connect: () => new Promise(() => {}) },
    { timeoutMs: 10 },
  );
  await assert.rejects(() => store.open(), /timed out/);
});
