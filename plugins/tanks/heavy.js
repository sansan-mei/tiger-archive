(function (root) {
  const node = typeof module === "object" && module.exports;
  const registry = node ? require("../registry.js") : root.TankPlugins;
  const hull = node ? require("./common.js") : root.buildTrackedHull;
  registry.register({
    kind: "tank",
    id: "heavy",
    version: "2.1.1",
    apiVersion: 1,
    spec: {
      name: "堡垒 · 重型机甲",
      hp: 280,
      shield: 120,
      ability: "deploy",
      speed: 8,
      reverse: 4,
      accel: 9,
      turn: 0.95,
      radius: 3.1,
      scale: 1.08,
      mount: [-0.42, 1.72, 0],
    },
    buildVisual(ctx) {
      hull(ctx);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
