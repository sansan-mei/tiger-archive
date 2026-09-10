const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"),
  fs = require("node:fs"),
  path = require("node:path");
const {
  files,
  optionsFor,
  shouldObfuscate,
  transform,
} = require("../scripts/client-release.cjs");
const { assetPath, createApp } = require("../server.js");
const ROOT = path.resolve(__dirname, "..");
test("release inventory protects all first-party browser scripts, preserves vendor and excludes private files", () => {
  const scripts = [
    "app-manifest.js",
    "client/bootstrap.js",
    ...require("../app-manifest.js").scripts,
  ];
  for (const file of scripts) {
    assert.ok(files.includes(file));
    assert.equal(shouldObfuscate(file), !file.startsWith("vendor/"));
  }
  for (const file of [
    "server.js",
    "redis-store.js",
    "plugins/catalog.js",
    "package.json",
    ".env",
  ])
    assert.ok(!files.includes(file));
  assert.equal(new Set(files).size, files.length);
  assert.equal(shouldObfuscate("battle.css"), false);
});
test("release URL routing never falls back to original source or exposes source maps", () => {
  for (const file of files) {
    assert.equal(
      assetPath("/" + file, { mode: "release" }),
      path.join(ROOT, "public-dist", file),
    );
  }
  for (const url of [
    "/server.js",
    "/public-dist/battle.js",
    "/battle.js.map",
    "/.client-release-test/battle.js",
    "/%2e%2e/server.js",
  ])
    assert.equal(assetPath(url, { mode: "release" }), null);
  assert.throws(() => createApp({ assetMode: "invalid" }), /ASSET_MODE/);
  const docker = fs.readFileSync(path.join(ROOT, "Dockerfile"), "utf8");
  assert.ok(docker.includes("ARG OBFUSCATE_CLIENT=true"));
  assert.ok(docker.includes("ASSET_MODE=release"));
  assert.ok(docker.includes("COPY --from=client-release"));
});
test("small obfuscator fixtures preserve cross-file plugin APIs and JSON protocol without eval", () => {
  // Only small in-memory fixtures: never build/transform the game during tests.
  const context = vm.createContext(
    { window: {} },
    { codeGeneration: { strings: false, wasm: false } },
  );
  const first = `(window.TankClient ??= {}).make = function (base) {
   const localSecretName = base + 20;
   return { damage: localSecretName, weaponType: 'rocket', publicName: '火箭筒' };
 };`;
  const second = `window.result = JSON.stringify(window.TankClient.make(80));`;
  const code1 = transform(first, "fixture-a.js"),
    code2 = transform(second, "fixture-b.js");
  assert.notEqual(code1, first);
  assert.ok(!code1.includes("localSecretName"));
  assert.ok(!code1.includes("sourceMappingURL"));
  vm.runInContext(code1, context);
  vm.runInContext(code2, context);
  assert.equal(
    context.window.result,
    JSON.stringify({ damage: 100, weaponType: "rocket", publicName: "火箭筒" }),
  );
  const options = optionsFor("core/combat.js");
  for (const option of [
    "sourceMap",
    "renameGlobals",
    "renameProperties",
    "controlFlowFlattening",
    "deadCodeInjection",
    "debugProtection",
    "selfDefending",
  ])
    assert.equal(options[option], false);
  assert.notEqual(
    optionsFor("a.js").identifiersPrefix,
    optionsFor("b.js").identifiersPrefix,
  );
  assert.equal(options.target, "browser-no-eval");
});
