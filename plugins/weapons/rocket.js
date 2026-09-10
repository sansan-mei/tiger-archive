(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "rocket",
    version: "1.0.0",
    apiVersion: 1,
    spec: {
      name: "火箭筒",
      damage: 20,
      splashDamage: 80,
      splashRadius: 6,
      cooldown: 150,
      speed: 38,
      life: 210,
      charge: 0,
      minCharge: 0,
      muzzle: 4.5,
      trigger: "automatic",
      delivery: "projectile",
      range: 140,
      minPower: 1,
      sound: "cannon",
    },
    buildVisual({ block, cylinder, edge, paint, glow, gun }) {
      cylinder(0.3, 2.7, -1.45, 0, 0, paint, gun, "x");
      cylinder(0.4, 0.25, -2.9, 0, 0, edge, gun, "x");
      cylinder(0.4, 0.22, 0, 0, 0, edge, gun, "x");
      block(0.5, 0.18, 0.16, -1, 0.37, 0, glow, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
