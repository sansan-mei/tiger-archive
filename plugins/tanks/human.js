(function (root) {
  const registry =
    typeof module === "object" && module.exports
      ? require("../registry.js")
      : root.TankPlugins;
  registry.register({
    kind: "tank",
    id: "human",
    version: "1.0.1",
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
      glow,
      accent,
      ink,
      tank,
      turret,
      limbs,
    }) {
      for (const side of [-1, 1]) {
        const leg = new T.Group();
        leg.position.set(0, 1.13, side * 0.29);
        tank.add(leg);
        block(0.35, 0.85, 0.36, 0, -0.42, 0, rubber, leg);
        block(0.42, 0.34, 0.42, -0.03, -0.49, 0, edge, leg);
        block(0.59, 0.28, 0.44, -0.12, -0.96, 0, ink, leg);
        block(0.12, 0.2, 0.3, -0.25, -0.46, 0, accent, leg);
        limbs.push(leg);
      }
      block(0.7, 0.75, 0.96, 0, -0.09, 0, paint, turret);
      block(0.16, 0.47, 0.72, -0.39, -0.07, 0, edge, turret);
      block(0.17, 0.12, 0.34, -0.48, 0.08, 0, glow, turret);
      block(0.35, 0.66, 0.69, 0.46, -0.05, 0, ink, turret);
      block(0.38, 0.14, 0.44, 0.49, 0.24, 0, accent, turret);
      // Oversized helmet and one clear visor instead of tiny facial details.
      block(0.78, 0.7, 0.88, -0.02, 0.67, 0, edge, turret);
      block(0.16, 0.35, 0.7, -0.44, 0.66, 0, ink, turret);
      block(0.18, 0.13, 0.52, -0.49, 0.7, 0, glow, turret);
      block(0.35, 0.12, 0.2, -0.02, 1.04, 0, accent, turret);
      for (const side of [-1, 1]) {
        cylinder(0.23, 0.16, 0, 0.67, side * 0.48, paint, turret, "z");
        block(0.55, 0.38, 0.32, -0.08, 0.12, side * 0.57, paint, turret);
        block(0.55, 0.23, 0.27, -0.37, -0.1, side * 0.57, rubber, turret);
      }
    },
  });
})(typeof window === "undefined" ? globalThis : window);
