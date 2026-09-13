/* Server-controlled PvE enemy. Geometry is original and has no texture downloads. */
(function (root) {
  const registry = typeof module === "object" && module.exports ? require("../registry.js") : root.TankPlugins;
  registry.register({
    kind: "tank", id: "zombie", version: "1.5.0", apiVersion: 1,
    spec: { name: "感染者", enemyOnly: true, hp: 80, shield: 0, ability: "dodge", movement: "strafe",
      height: 3, muzzleScale: 0.55, speed: 3.6, reverse: 2, accel: 20,
      turn: 3.5, radius: 0.7, scale: 1, mount: [0, 1.55, 0],
      variants: {
        boss: { name: "零号感染体 · 中期 BOSS", hp: 1200, speed: 6, meleeRange: 2.8, meleeDamage: 30, meleeCooldown: 60, wave: 8 },
        titan: { name: "泰坦感染体 · 最终 BOSS", hp: 2200, speed: 6, meleeRange: 3.4, meleeDamage: 42, meleeCooldown: 72, wave: 16 },
        walker: { name: "普通感染者", hp: 80, speed: 3.6, meleeDamage: 8, meleeCooldown: 60, wave: 1 },
        cone: { name: "锥帽感染者", hp: 140, speed: 3.2, meleeDamage: 10, meleeCooldown: 60, wave: 2 },
        runner: { name: "疾跑感染者", hp: 60, speed: 6, meleeDamage: 6, meleeCooldown: 42, wave: 3 },
        bucket: { name: "铁盔感染者", hp: 240, speed: 2.8, meleeDamage: 12, meleeCooldown: 72, wave: 4 },
        brute: { name: "重锤巨人感染者", hp: 400, speed: 2.2, meleeDamage: 24, meleeCooldown: 72, wave: 9 },
      } },
    buildVisual({ T, block, cylinder, paint, edge, rubber, ink, accent, glow, tank, turret, limbs, zombieType = "walker" }) {
      paint.color.setHex(0x8eaf61);
      rubber.color.setHex(zombieType === "runner" ? 0xb15342 : ["brute", "boss", "titan"].includes(zombieType) ? 0x4d6270 : 0x5c5471);
      if (["brute", "boss", "titan"].includes(zombieType)) paint.color.setHex(0x74965a);
      if (zombieType === "boss") {
        paint.color.setHex(0xac535c); accent.color.setHex(0xff755d);
        for (const side of [-1, 1]) block(0.2, 0.4, 0.22, 0, 1.15, side * 0.34, ink, turret);
      } else if (zombieType === "titan") {
        paint.color.setHex(0x4f477f); accent.color.setHex(0xc48cff); glow.color.setHex(0xf2bdff);
        for (const side of [-1, 1]) {
          block(0.28, 0.72, 0.3, -0.02, 1.15, side * 0.52, accent, turret);
          block(0.2, 0.34, 0.2, -0.28, 1.55, side * 0.3, glow, turret);
        }
      }
      glow.color.setHex(zombieType === "titan" ? 0xf2bdff : 0xffcc70);
      glow.emissive.setHex(zombieType === "titan" ? 0x6d278b : 0x8b320f);
      block(["brute", "boss", "titan"].includes(zombieType) ? 1.02 : 0.75, 0.84, ["brute", "boss", "titan"].includes(zombieType) ? 1.2 : 0.95, 0.05, -0.04, 0, rubber, turret);
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
      if (zombieType === "cone") {
        const cone = new T.Mesh(new T.ConeGeometry(0.48, 0.54, 5), accent);
        cone.position.set(-0.12, 1.1, 0);
        cone.rotation.z = -0.13;
        cone.castShadow = true;
        turret.add(cone);
        block(0.96, 0.08, 1.02, -0.12, 0.86, 0, accent, turret);
        cylinder(0.27, 0.07, -0.1, 1.12, 0, edge, turret);
      } else if (zombieType === "bucket") {
        edge.color.setHex(0x9baeb8);
        cylinder(0.53, 0.44, -0.12, 1.03, 0, edge, turret);
        cylinder(0.59, 0.09, -0.12, 0.84, 0, ink, turret);
        block(0.18, 0.2, 0.68, -0.61, 0.9, 0, accent, turret);
      } else if (zombieType === "runner") {
        block(0.87, 0.17, 0.97, -0.16, 0.98, 0, accent, turret);
        block(0.14, 0.2, 0.79, -0.62, 0.75, 0, ink, turret);
        for (const side of [-1, 1]) {
          block(0.17, 0.12, 0.28, -0.69, 0.76, side * 0.23, glow, turret);
          block(0.2, 0.46, 0.12, -0.37, -0.07, side * 0.32, accent, turret);
        }
      } else if (["brute", "boss", "titan"].includes(zombieType)) {
        block(0.65, 0.35, 1.25, 0, 0.29, 0, edge, turret);
        cylinder(0.09, 1.28, -1, 0.04, 0.65, ink, turret);
        block(0.72, 0.43, 0.61, -1, 0.74, 0.65, edge, turret);
        block(0.78, 0.12, 0.66, -1, 0.74, 0.65, accent, turret);
      }
      block(0.09, 0.12, 0.36, -0.6, 0.47, 0, ink, turret);
      block(0.1, 0.13, 0.12, -0.65, 0.46, 0.07, accent, turret);
    },
  });
})(typeof window === "undefined" ? globalThis : window);
