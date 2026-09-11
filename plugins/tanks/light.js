(function (root) {
  const node = typeof module === "object" && module.exports;
  const registry = node ? require("../registry.js") : root.TankPlugins;
  const hull = node ? require("./common.js") : root.buildTrackedHull;
  registry.register({
    kind: "tank",
    id: "light",
    version: "2.2.0",
    apiVersion: 1,
    spec: {
      name: "游隼 · 轻型机甲",
      hp: 140,
      shield: 0,
      ability: "dash",
      speed: 14,
      reverse: 7,
      accel: 17,
      turn: 1.65,
      radius: 2.3,
      scale: 0.8,
      mount: [-0.42, 1.72, 0],
    },
    buildVisual(ctx) {
      hull(ctx);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
