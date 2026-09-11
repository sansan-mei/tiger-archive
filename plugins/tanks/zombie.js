/* Server-controlled PvE enemy. Geometry is original and has no texture downloads. */
(function (root) {
  const registry = typeof module === "object" && module.exports ? require("../registry.js") : root.TankPlugins;
  registry.register({
    kind: "tank", id: "zombie", version: "1.0.0", apiVersion: 1,
    spec: { name: "感染者", enemyOnly: true, hp: 80, shield: 0, ability: "dodge", movement: "strafe",
      height: 2.8, muzzleScale: 0.55, speed: 3.6, reverse: 2, accel: 20,
      turn: 3.5, radius: 0.7, scale: 1, mount: [0, 1.55, 0] },
    buildVisual({ T, block, paint, rubber, ink, accent, glow, tank, turret, limbs }) {
      paint.color.setHex(0x8eaf61);
      rubber.color.setHex(0x5c5471);
      glow.color.setHex(0xffcc70);
      glow.emissive.setHex(0x8b320f);
      block(0.75, 0.84, 0.95, 0.05, -0.04, 0, rubber, turret);
      block(0.82, 0.72, 0.9, -0.16, 0.7, 0, paint, turret);
      for (const side of [-1, 1]) {
        block(0.08, 0.16, 0.19, -0.6, 0.75, side * 0.23, glow, turret);
        block(1.02, 0.25, 0.25, -0.44, 0.22, side * 0.62, paint, turret);
        block(0.28, 0.27, 0.33, -1.06, 0.17, side * 0.62, paint, turret);
        const leg = new T.Group();
        leg.position.set(0, 1.1, side * 0.28);
        tank.add(leg);
        block(0.34, 0.85, 0.35, 0, -0.43, 0, rubber, leg);
        block(0.5, 0.26, 0.38, -0.1, -0.97, 0, ink, leg);
        limbs.push(leg);
      }
      block(0.09, 0.12, 0.36, -0.6, 0.47, 0, ink, turret);
      block(0.1, 0.13, 0.12, -0.65, 0.46, 0.07, accent, turret);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
