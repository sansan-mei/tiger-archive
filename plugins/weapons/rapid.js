(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "rapid",
    version: "2.1.1",
    apiVersion: 1,
    spec: {
      name: "快速炮",
      damage: 9,
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
    buildVisual({ blaster, block, glow, gun }) {
      blaster("j");
    },
  });
})(typeof window === "undefined" ? globalThis : window);
