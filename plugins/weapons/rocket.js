(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "rocket",
    version: "1.0.4",
    apiVersion: 1,
    spec: {
      name: "火箭筒",
      damage: 20,
      splashDamage: 80,
      splashRadius: 8,
      cooldown: 150,
      speed: 114,
      life: 70,
      charge: 0,
      minCharge: 0,
      muzzle: 4.5,
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
      cylinder(0.43, L - 0.25, -(L - 0.05) / 2, 0, 0, paint, gun, "x");
      cylinder(0.53, 0.24, -L + 0.16, 0, 0, edge, gun, "x");
      cylinder(0.37, 0.04, -L + 0.02, 0, 0, ink, gun, "x");
      cylinder(0.48, 0.18, -0.1, 0, 0, edge, gun, "x");
      for (const x of [-0.65, -L + 0.7])
        cylinder(0.46, 0.16, x, 0, 0, accent, gun, "x");
      block(0.46, 0.16, 0.18, -0.6, 0.5, 0, ink, gun);
      block(0.08, 0.12, 0.14, -0.86, 0.52, 0, glow, gun);
      block(0.28, 0.43, 0.25, -0.45, -0.56, 0, ink, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
