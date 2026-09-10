(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "tank",
    id: "human",
    version: "1.0.0",
    apiVersion: 1,
    spec: {
      name: "人类 · 火箭兵",
      hp: 80,
      shield: 0,
      ability: "dodge",
      movement: "strafe",
      muzzleScale: 0.55,
      height: 2.8,
      speed: 9,
      reverse: 7,
      accel: 35,
      turn: 3,
      radius: 0.7,
      scale: 1,
      mount: [0, 1.65, 0],
    },
    buildVisual({
      T,
      block,
      cylinder,
      paint,
      edge,
      rubber,
      tank,
      turret,
      limbs,
    }) {
      for (const side of [-1, 1]) {
        const leg = new T.Group();
        leg.position.set(0, 1.2, side * 0.3);
        tank.add(leg);
        block(0.34, 0.95, 0.35, 0, -0.48, 0, paint, leg);
        block(0.62, 0.22, 0.38, -0.12, -1, 0, rubber, leg);
        limbs.push(leg);
      }
      block(0.72, 0.82, 1, 0, 0.04, 0, paint, turret);
      block(0.25, 0.65, 0.75, 0.48, 0, 0, edge, turret);
      cylinder(0.34, 0.5, 0, 0.73, 0, edge, turret);
      block(0.05, 0.17, 0.47, -0.34, 0.76, 0, rubber, turret);
      for (const side of [-1, 1])
        block(0.55, 0.24, 0.25, -0.4, 0.12, side * 0.65, paint, turret);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
