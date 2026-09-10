(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "rapid",
    version: "2.1.3",
    apiVersion: 1,
    spec: {
      name: "快速炮",
      damage: 13,
      cooldown: 18,
      speed: 112,
      life: 115,
      charge: 0,
      minCharge: 0,
      muzzle: 4.4,
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
      cylinder(0.49, 0.85, -0.45, 0, 0, paint, gun, "x");
      for (const side of [-1, 1]) {
        cylinder(0.38, 0.34, -0.48, -0.06, side * 0.62, edge, gun, "z");
        cylinder(0.18, 0.36, -0.48, -0.06, side * 0.63, accent, gun, "z");
      }
      for (const y of [-0.19, 0.19])
        for (const z of [-0.19, 0.19]) {
          cylinder(0.13, L - 0.72, -(L + 0.64) / 2, y, z, edge, gun, "x");
          cylinder(0.09, 0.04, -L + 0.02, y, z, ink, gun, "x");
        }
      block(0.22, 0.75, 0.75, -L + 0.3, 0, 0, paint, gun);
      block(0.17, 0.14, 0.2, -0.36, 0.5, 0, glow, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
