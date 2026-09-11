const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const root = path.resolve(__dirname, "..");
function worker({ fetch = async () => new Response("online"), failInstall = false } = {}) {
  const handlers = {}, removed = [], stored = [];
  const cache = {
    addAll: async (urls) => { if (failInstall) throw Error("offline"); stored.push(...urls); },
    match: async () => new Response("offline page"),
  };
  vm.runInNewContext(fs.readFileSync(path.join(root, "service-worker.js"), "utf8"), {
    self: { location: { origin: "https://mh33.top:3007" },
      addEventListener: (name, handler) => { handlers[name] = handler; } },
    caches: { open: async () => cache,
      keys: async () => ["other-app", "tiger-field-v1", "tiger-field-online-v2"],
      delete: async (name) => { removed.push(name); } },
    fetch, URL, Response,
  });
  return { handlers, removed, stored };
}
test("PWA worker is not a page script; install assets and icons exist in the release inventory", () => {
  const manifest = require("../app-manifest.js"), files = require("../scripts/client-release.cjs").files;
  assert.ok(!manifest.scripts.includes("service-worker.js"));
  assert.ok(manifest.scripts.includes("client/pwa.js"));
  for (const file of ["service-worker.js", "offline.html", "manifest.webmanifest"])
    assert.ok(files.includes(file));
  for (const icon of JSON.parse(fs.readFileSync(path.join(root, "manifest.webmanifest"))).icons) {
    const data = fs.readFileSync(path.join(root, icon.src));
    assert.equal(`${data.readUInt32BE(16)}x${data.readUInt32BE(20)}`, icon.sizes);
  }
});
test("installation failure rejects; activation cleans only this game's old caches", async () => {
  const w = worker(); let pending;
  w.handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(w.stored, ["/offline.html"]);
  w.handlers.activate({ waitUntil: (promise) => { pending = promise; } });
  await pending;
  assert.deepEqual(w.removed, ["tiger-field-v1"]);
  worker({ failInstall: true }).handlers.install({ waitUntil: (promise) => { pending = promise; } });
  await assert.rejects(pending, /offline/);
});
test("game code, assets and APIs bypass SW caches; offline navigation gets a real response", async () => {
  const w = worker({ fetch: async () => { throw Error("offline"); } });
  for (const url of ["/core/content.js", "/plugins/weapons/laser.js", "/api/rooms", "/ws", "/client/models/arsenal.json"]) {
    w.handlers.fetch({ request: { url: "https://mh33.top:3007" + url, method: "GET", mode: "cors" },
      respondWith: () => assert.fail("must use normal network path") });
  }
  let response;
  w.handlers.fetch({ request: { url: "https://mh33.top:3007/index.html", method: "GET", mode: "navigate" },
    respondWith: (promise) => { response = promise; } });
  assert.equal(await (await response).text(), "offline page");
});
test("registration bypasses HTTP cache and never reloads or force-activates mid-match", async () => {
  const calls = [];
  vm.runInNewContext(fs.readFileSync(path.join(root, "client/pwa.js"), "utf8"), {
    window: { navigator: { serviceWorker: { register: async (url, options) => calls.push([url, options.updateViaCache]) } } },
    document: { readyState: "complete" }, console,
  });
  assert.deepEqual(calls, [["/service-worker.js", "none"]]);
});
