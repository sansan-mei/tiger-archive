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
    "plugins/tanks/zombie.js",
    "plugins/weapons/standard.js",
    "plugins/weapons/rapid.js",
    "plugins/weapons/laser.js",
    "plugins/weapons/rocket.js",
    "plugins/weapons/pistol.js",
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
    "core/pve.js",
    "battle-core.js",
    "battle-session.js",
    "network-session.js",
    "client/model-assets.js",
    "tank-model.js",
    "client/environment.js",
    "client/scene.js",
    "client/recoil.js",
    "client/camera.js",
    "client/input.js",
    "client/aim-assist.js",
    "client/effects.js",
    "client/engine-audio.js",
    "client/hud.js",
    "client/units.js",
    "client/rooms.js",
    "client/pve-ui.js",
    "battle.js",
    "client/pwa.js",
  ]);
  const assets = Object.freeze([
    "client/audio/tank-drive.mp3",
    "client/models/arsenal.json",
    "client/environment/maintenance-kit.json",
    "client/icons/icon-192x192.png",
    "client/icons/icon-512x512.png",
    "client/icons/icon-maskable-512x512.png",
    "manifest.webmanifest",
    "service-worker.js",
    "offline.html",
  ]);
  return Object.freeze({ plugins, scripts, assets });
});
