(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "weapon",
    id: "laser",
    version: "2.1.0",
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
      minPower: 0.35,
      sound: "energy",
    },
    buildVisual({ T, block, cylinder, paint, edge, glow, gun }) {
      block(2.7, 0.28, 0.38, -1.8, 0, 0, edge, gun);
      for (const z of [-0.35, 0.35])
        block(3.0, 0.16, 0.13, -1.84, 0, z, glow, gun);
      for (let i = 0; i < 5; i++) {
        const coil = new T.Mesh(new T.TorusGeometry(0.25, 0.04, 6, 16), glow);
        coil.rotation.y = Math.PI / 2;
        coil.position.x = -0.7 - i * 0.5;
        gun.add(coil);
      }
    },
  });
})(typeof window === "undefined" ? globalThis : window);
