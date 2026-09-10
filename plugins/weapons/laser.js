(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "laser",
    version: "2.2.1",
    apiVersion: 1,
    spec: {
      name: "蓄力激光炮",
      damage: 100,
      cooldown: 144,
      speed: 0,
      life: 0,
      charge: 90,
      minCharge: 18,
      muzzle: 4.8,
      trigger: "charge",
      delivery: "ray",
      range: 140,
      beamRadius: 0.45,
      minPower: 0.35,
      sound: "energy",
    },
    buildVisual({ blaster, block, glow, gun }) {
      blaster("r");
      for (const side of [-1, 1])
        block(1.8, 0.09, 0.09, -1.65, 0.22, side * 0.34, glow, gun);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
