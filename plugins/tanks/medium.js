(function (root) {
  const node = typeof module === "object" && module.exports;
  const registry = node ? require("../registry.js") : root.TankPlugins;
  const hull = node ? require("./common.js") : root.buildTrackedHull;
  registry.register({
    kind: "tank",
    id: "medium",
    version: "2.1.1",
    apiVersion: 1,
    spec: {
      name: "先锋 · 中型机甲",
      hp: 210,
      shield: 90,
      ability: "barrier",
      speed: 11,
      reverse: 5.5,
      accel: 13,
      turn: 1.25,
      radius: 2.7,
      scale: 0.94,
      mount: [-0.42, 1.72, 0],
    },
    buildVisual(ctx) {
      hull(ctx);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
