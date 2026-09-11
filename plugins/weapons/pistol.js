(function (root) {
  const registry = typeof module === "object" && module.exports ? require("../registry.js") : root.TankPlugins;
  registry.register({
    kind: "weapon", id: "pistol", version: "1.1.0", apiVersion: 1,
    spec: { name: "小手枪", damage: 20, cooldown: 24, speed: 360, life: 20,
      charge: 0, minCharge: 0, muzzle: 1.8, trigger: "automatic", delivery: "projectile",
      magazineSize: 9, reloadTicks: 90, range: 120, minPower: 1, sound: "cannon" },
    buildVisual({ block, cylinder, edge, ink, glow, gun, weaponLength: L }) {
      block(L * 0.5, 0.3, 0.32, -L * 0.3, 0, 0, edge, gun);
      block(0.2, 0.55, 0.3, -L * 0.2, -0.25, 0, ink, gun);
      cylinder(0.1, L * 0.8, -L * 0.6, 0, 0, ink, gun, "x");
      block(0.08, 0.1, 0.1, -L * 0.55, 0.2, 0, glow, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
