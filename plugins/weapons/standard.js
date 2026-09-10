(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "standard",
    version: "2.1.0",
    apiVersion: 1,
    spec: {
      name: "标准炮",
      damage: 35,
      cooldown: 72,
      speed: 88,
      life: 160,
      charge: 0,
      minCharge: 0,
      muzzle: 5.0,
      trigger: "automatic",
      delivery: "projectile",
      range: 140,
      minPower: 1,
      sound: "cannon",
    },
    buildVisual({ T, block, cylinder, paint, edge, glow, gun }) {
      cylinder(0.115, 3.05, -1.87, 0, 0, paint, gun, "x");
      block(0.42, 0.25, 0.3, -3.44, 0, 0, edge, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
