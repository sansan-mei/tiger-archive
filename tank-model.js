/* Lightweight vehicle visuals. Gameplay dimensions come from the shared catalogue. */
window.createTankModel = function (
  T,
  { tankType, weaponType, zombieType = "walker", color = 0x61c6b1 },
) {
  const spec = window.TankBattle.TANKS[tankType],
    weapon = window.TankBattle.WEAPONS[weaponType];
  const tank = new T.Group(),
    turret = new T.Group(),
    gun = new T.Group();
  const paint = new T.MeshToonMaterial({ color });
  const edge = new T.MeshToonMaterial({ color: 0xf2ecd9 });
  const rubber = new T.MeshToonMaterial({ color: 0x293d51 });
  const glow = new T.MeshToonMaterial({
    color: 0x67d8e0,
    emissive: 0x176b7e,
    emissiveIntensity: 1.0,
  });
  // Shared beveled cube: a small silhouette upgrade without textures or extra draws.
  const geometry = new T.BoxGeometry(1, 1, 1, 2, 2, 2);
  const positions = geometry.attributes.position;
  const point = new T.Vector3(),
    core = new T.Vector3();
  for (let i = 0; i < positions.count; i++) {
    point.fromBufferAttribute(positions, i);
    core.copy(point).clampScalar(-0.38, 0.38);
    point.sub(core).normalize().multiplyScalar(0.12).add(core);
    positions.setXYZ(i, point.x, point.y, point.z);
  }
  geometry.computeVertexNormals();
  const accent = new T.MeshToonMaterial({ color: 0xffbd61 });
  const ink = new T.MeshToonMaterial({ color: 0x152b40 });
  const wheels = [],
    limbs = [];
  function block(w, h, d, x, y, z, material = paint, parent = tank) {
    const m = new T.Mesh(geometry, material);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  function cylinder(r, h, x, y, z, material, parent, axis = "y") {
    const m = new T.Mesh(new T.CylinderGeometry(r, r, h, 12), material);
    m.position.set(x, y, z);
    if (axis === "z") m.rotation.x = Math.PI / 2;
    if (axis === "x") m.rotation.z = Math.PI / 2;
    m.castShadow = true;
    m.receiveShadow = true;
    parent.add(m);
    return m;
  }
  const ctx = {
    T,
    tankType,
    weaponType,
    zombieType,
    weaponLength:
      weapon.muzzle - (spec.movement === "strafe" ? 0.35 / 0.55 : 1.54),
    accent,
    ink,
    block,
    cylinder,
    paint,
    edge,
    rubber,
    glow,
    tank,
    turret,
    gun,
    wheels,
    limbs,
  };
  const authored =
    window.TankModelAssets?.build(ctx, { tankType, weaponType }) || false;
  if (!authored) window.TankPlugins.tanks[tankType].buildVisual(ctx);
  turret.position.set(...spec.mount);
  tank.add(turret);
  if (!authored && spec.movement !== "strafe") {
    const width = tankType === "heavy" ? 2.35 : tankType === "light" ? 1.65 : 2;
    block(2.0, 0.78, width, 0.05, 0.4, 0, paint, turret);
    block(0.12, 0.3, width * 0.65, -0.97, 0.51, 0, ink, turret);
    block(0.14, 0.1, width * 0.5, -1.04, 0.55, 0, glow, turret);
    block(0.8, 0.13, 0.78, 0.2, 0.86, 0, edge, turret);
    for (const side of [-1, 1]) {
      block(1.25, 0.42, 0.25, 0.12, 0.35, (side * width) / 2, edge, turret);
      block(
        0.28,
        0.45,
        0.28,
        -0.17,
        0.36,
        side * (width / 2 + 0.02),
        accent,
        turret,
      );
    }
    cylinder(0.07, 0.4, 0.65, 0.89, -0.58, rubber, turret);
    block(0.19, 0.13, 0.19, 0.65, 1.1, -0.58, glow, turret);
  }
  gun.position.set(-1.12, 0.51, 0);
  turret.add(gun);
  if (!authored && tankType !== "zombie") {
    block(0.3, 0.58, 1.3, 0, 0, 0, edge, gun);
    window.TankPlugins.weapons[weaponType].buildVisual(ctx);
  }
  if (spec.movement === "strafe") {
    gun.scale.setScalar(0.55);
    gun.position.set(-0.35, 0.51, 0.6);
  }
  if (ctx.characterGunPosition) gun.position.copy(ctx.characterGunPosition);
  const gunRestPosition = gun.position.clone();
  tank.scale.setScalar(spec.scale);
  // Merge stationary armor by material, preserving turret/gun/limb/wheel pivots.
  const animated = new Set(wheels);
  const retired = new Set();
  for (const parent of [tank, turret, gun, ...limbs]) {
    const groups = new Map();
    for (const mesh of [...parent.children]) {
      if (!mesh.isMesh || mesh.isSkinnedMesh || mesh.material.map || animated.has(mesh) || mesh.geometry.attributes.color)
        continue;
      mesh.updateMatrix();
      const copy = mesh.geometry
        .clone()
        .applyMatrix4(mesh.matrix)
        .toNonIndexed();
      if (!groups.has(mesh.material)) groups.set(mesh.material, []);
      groups.get(mesh.material).push(copy);
      retired.add(mesh.geometry);
      parent.remove(mesh);
    }
    for (const [material, parts] of groups) {
      const merged = new T.BufferGeometry();
      for (const attribute of ["position", "normal"]) {
        const values = parts.flatMap((g) =>
          Array.from(g.attributes[attribute].array),
        );
        merged.setAttribute(attribute, new T.Float32BufferAttribute(values, 3));
      }
      parts.forEach((g) => g.dispose());
      const mesh = new T.Mesh(merged, material);
      mesh.castShadow = mesh.receiveShadow = true;
      parent.add(mesh);
    }
  }
  const retained = new Set();
  retired.add(geometry);
  tank.traverse((o) => {
    if (o.geometry) retained.add(o.geometry);
  });
  for (const g of retired) if (!retained.has(g)) g.dispose();
  const criticalGlow = new T.Mesh(
    new T.SphereGeometry(0.3, 8, 6),
    new T.MeshBasicMaterial({
      color: 0xffa52f,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
    }),
  );
  criticalGlow.position.x = -ctx.weaponLength + 0.31;
  criticalGlow.name = "critical-muzzle-glow";
  criticalGlow.visible = false;
  criticalGlow.userData.aimIgnore = true;
  gun.add(criticalGlow);
  const wreck = new T.MeshToonMaterial({ color: 0x6c7166 });
  const originals = new Map();
  tank.traverse((o) => {
    if (o.isMesh) originals.set(o, o.material);
  });
  const shield = new T.Mesh(
    new T.SphereGeometry(4.2, 16, 10),
    new T.MeshBasicMaterial({
      color: 0x85e8e2,
      wireframe: true,
      transparent: true,
      opacity: 0.3,
      depthWrite: false,
    }),
  );
  if (spec.movement === "strafe") shield.scale.setScalar(0.4);
  shield.position.y = 1.6;
  shield.visible = false;
  tank.add(shield);
  const frontShield = new T.Mesh(
    shield.geometry,
    new T.MeshBasicMaterial({
      color: 0xffc66e,
      wireframe: true,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    }),
  );
  frontShield.visible = false;
  frontShield.scale.set(0.07, 0.6, 0.85);
  frontShield.position.set(-3.8, 1, 0);
  turret.add(frontShield);
  ctx.animateCharacter?.();
  return {
    gunRestPosition,
    animateCharacter: ctx.animateCharacter,
    criticalGlow,
    assetSource: authored ? "blender" : "procedural",
    frontShield,
    tank,
    turret,
    gun,
    wheels,
    limbs,
    paint,
    glow,
    shield,
    wreck,
    originals,
    recoil: 0,
    dead: false,
    spec,
    weapon,
    dispose() {
      ctx.disposeCharacter?.();
      const geometries = new Set(),
        materials = new Set();
      tank.traverse((o) => {
        if (o.geometry) geometries.add(o.geometry);
        if (o.material) materials.add(o.material);
      });
      for (const m of originals.values()) materials.add(m);
      for (const material of [paint, edge, rubber, glow, accent, ink, wreck])
        materials.add(material);
      for (const g of geometries) g.dispose();
      for (const m of materials) m.dispose();
    },
  };
};
