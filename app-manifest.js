/* The sole trusted module inventory used by browser, Node catalogue and HTTP allowlist. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TankAppManifest = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  const plugins = Object.freeze([
    "plugins/tanks/light.js",
    "plugins/tanks/medium.js",
    "plugins/tanks/heavy.js",
    "plugins/tanks/human.js",
    "plugins/weapons/standard.js",
    "plugins/weapons/rapid.js",
    "plugins/weapons/laser.js",
    "plugins/weapons/rocket.js",
  ]);
  const scripts = Object.freeze([
    "vendor/three.min.js",
    "core/abilities.js",
    "plugins/registry.js",
    "plugins/tanks/common.js",
    ...plugins,
    "core/map.js",
    "core/math.js",
    "core/network-state.js",
    "core/content.js",
    "core/world.js",
    "core/ai.js",
    "core/combat.js",
    "core/movement.js",
    "core/falling.js",
    "core/match.js",
    "battle-core.js",
    "battle-session.js",
    "network-session.js",
    "tank-model.js",
    "client/scene.js",
    "client/camera.js",
    "client/input.js",
    "client/effects.js",
    "client/hud.js",
    "client/units.js",
    "client/rooms.js",
    "battle.js",
  ]);
  return Object.freeze({ plugins, scripts });
});
