const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const C = require("../battle-core.js");
const { RoomServer } = require("../room-server.js");
test("room directory reflects occupancy and phases without exposing seats or tokens", () => {
  const server = new RoomServer();
  const room = {
    code: "ABCDEF",
    host: "p1",
    phase: "lobby",
    seats: [{ id: "p1", name: "Host", token: "secret" }],
  };
  server.rooms.set(room.code, room);
  assert.equal(server.publicRooms()[0].joinable, true);
  for (const phase of ["playing", "finished"]) {
    room.phase = phase;
    assert.equal(server.publicRooms()[0].joinable, false);
  }
  room.phase = "lobby";
  room.seats = Array.from({ length: 8 }, (_, i) => ({
    id: "p" + i,
    name: "Player",
    token: "secret",
  }));
  assert.equal(server.publicRooms()[0].joinable, false);
  assert.equal(server.publicRooms()[0].players, 8);
  assert.ok(!JSON.stringify(server.publicRooms()).includes("secret"));
  server.rooms.clear();
  assert.deepEqual(server.publicRooms(), []);
});
test("room browser renders empty/error/full rooms, safely joins, throttles and recovers", async () => {
  class Element {
    constructor() {
      this.children = [];
      this.listeners = {};
    }
    append(...items) {
      this.children.push(...items);
    }
    appendChild(item) {
      this.children.push(item);
    }
    replaceChildren(...items) {
      this.children = items;
    }
    addEventListener(type, fn) {
      this.listeners[type] = fn;
    }
  }
  const nodes = Object.fromEntries(
    ["room-list", "room-list-status", "refresh-rooms"].map((id) => [
      id,
      new Element(),
    ]),
  );
  const context = vm.createContext({
    window: {},
    document: { createElement: () => new Element() },
    AbortController,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../client/rooms.js"), "utf8"),
    context,
  );
  let calls = 0,
    fail = false,
    data = { version: C.VERSION, rooms: [] },
    joined;
  const ui = context.window.TankClient.createRoomBrowser({
    $: (id) => nodes[id],
    C,
    onJoin: (code) => (joined = code),
    fetchImpl: async () => {
      calls++;
      if (fail) throw new Error("offline");
      return { ok: true, json: async () => data };
    },
  });
  await ui.refresh();
  assert.match(nodes["room-list-status"].textContent, /暂无房间/);
  data.rooms = [
    {
      code: "ABCDEF",
      hostName: "<img onerror=alert(1)>",
      players: 1,
      capacity: 8,
      phase: "lobby",
      joinable: true,
    },
    {
      code: "AAAAAA",
      hostName: "Full",
      players: 8,
      capacity: 8,
      phase: "lobby",
      joinable: false,
    },
    {
      code: "BBBBBB",
      hostName: "Playing",
      players: 2,
      capacity: 8,
      phase: "playing",
      joinable: false,
    },
  ];
  await ui.refresh();
  const cards = nodes["room-list"].children;
  assert.equal(
    cards[0].children[0].children[0].textContent,
    "<img onerror=alert(1)>的房间",
  );
  assert.equal(cards[1].children[1].disabled, true);
  assert.equal(cards[2].children[1].disabled, true);
  cards[0].children[1].listeners.click();
  assert.equal(joined, "ABCDEF");
  ui.setBusy(true);
  assert.equal(cards[0].children[1].disabled, true);
  const before = calls;
  ui.update(10000, true);
  assert.equal(calls, before);
  ui.setBusy(false);
  ui.update(10000, false);
  assert.equal(calls, before);
  ui.update(10000, true);
  ui.update(10001, true);
  assert.equal(calls, before + 1);
  await new Promise((resolve) => setImmediate(resolve));
  ui.update(11000, true);
  assert.equal(calls, before + 1);
  fail = true;
  await ui.refresh();
  assert.equal(nodes["room-list"].children.length, 0);
  assert.equal(nodes["room-list-status"].textContent, "offline");
  fail = false;
  await ui.refresh();
  assert.equal(nodes["room-list"].children.length, 3);
});
