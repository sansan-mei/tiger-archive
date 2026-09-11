(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "laser",
    version: "2.5.0",
    apiVersion: 1,
    spec: {
      name: "延时穿透激光炮",
      damage: 100,
      cooldown: 102,
      speed: 0,
      life: 0,
      charge: 90,
      minCharge: 90,
      muzzle: 4.8,
      trigger: "delayed",
      delivery: "ray",
      penetratesBodies: true,
      range: 140,
      beamRadius: 0.45,
      minPower: 1,
      sound: "energy",
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
      block(1.05, 0.58, 0.9, -0.43, 0, 0, paint, gun);
      block(L - 0.15, 0.2, 0.3, -L / 2, 0, 0, ink, gun);
      for (const side of [-1, 1]) {
        block(L - 0.22, 0.28, 0.21, -(L + 0.22) / 2, 0, side * 0.39, edge, gun);
        block(
          L - 0.4,
          0.085,
          0.06,
          -(L + 0.3) / 2,
          0.17,
          side * 0.39,
          glow,
          gun,
        );
        block(0.16, 0.42, 0.27, -L + 0.1, 0, side * 0.39, accent, gun);
      }
      for (let i = 0; i < 3; i++) {
        cylinder(0.3, 0.12, -0.9 - i * 0.42, 0, 0, glow, gun, "x");
        cylinder(0.34, 0.07, -0.99 - i * 0.42, 0, 0, ink, gun, "x");
      }
    },
  });
})(typeof window === "undefined" ? globalThis : window);
