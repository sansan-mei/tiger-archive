(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "standard",
    version: "2.2.0",
    apiVersion: 1,
    spec: {
      name: "标准炮",
      damage: 35,
      criticalHits: 2,
      criticalMultiplier: 2,
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
    buildVisual({
      block,
      cylinder,
      paint,
      edge,
      ink,
      accent,
      glow,
      gun,
      weaponLength: L,
    }) {
      block(1.05, 0.7, 0.85, -0.45, 0, 0, paint, gun);
      cylinder(0.24, L - 0.8, -(L + 0.4) / 2, 0, 0, edge, gun, "x");
      cylinder(0.41, 0.42, -L + 0.27, 0, 0, paint, gun, "x");
      cylinder(0.27, 0.04, -L + 0.02, 0, 0, ink, gun, "x");
      cylinder(0.3, 0.16, -1, 0, 0, accent, gun, "x");
      block(0.65, 0.14, 0.25, -0.55, 0.42, 0, ink, gun);
      block(0.16, 0.08, 0.18, -0.84, 0.46, 0, glow, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
