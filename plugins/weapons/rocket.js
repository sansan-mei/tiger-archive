(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "rocket",
    version: "1.0.1",
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
    buildVisual({ blaster, block, glow, gun }) {
      blaster("h");
    },
  });
})(typeof window === "undefined" ? globalThis : window);
