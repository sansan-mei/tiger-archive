/* Unit models, labels, recoil, walking, shields and projectile visuals. */
(window.TankClient ??= {}).createUnits = function ({
  T,
  C,
  scene,
  floorGroups,
  labelHost,
  sphere,
  shellMat,
  reduced,
  effects,
  sound,
  getEntities,
  getPlayerId,
}) {
  const projected = new T.Vector3();
  const views = new Map(),
    bullets = new Map(),
    palette = [
      0xa8b58a, 0xc78772, 0x87a9bf, 0xd1b775, 0xa393b2, 0x73a89a, 0xd49e75,
      0x91a5ae,
    ];
  function createViews() {
    for (const view of views.values()) {
      scene.remove(view.tank);
      view.label?.remove();
      view.warning?.geometry.dispose();
      view.warning?.material.dispose();
      scene.remove(view.warning);
      view.dispose();
    }
    views.clear();
    getEntities().forEach((body, i) => {
      const view = window.createTankModel(T, {
        tankType: body.tankType,
        weaponType: body.weaponType,
        color: palette[i],
      });
      view.tank.traverse((o) => {
        o.userData.entityId = body.id;
      });
      scene.add(view.tank);
      if (body.id !== getPlayerId()) {
        const label = document.createElement("div");
        label.className = "enemy-tag";
        const text = document.createElement("span");
        text.textContent = body.id + " / " + C.TANKS[body.tankType].name;
        const bar = document.createElement("div"),
          fill = document.createElement("i");
        bar.appendChild(fill);
        label.append(text, bar);
        labelHost.appendChild(label);
        view.label = label;
        view.bar = fill;
      }
      view.warning = new T.Line(
        new T.BufferGeometry().setFromPoints([
          new T.Vector3(),
          new T.Vector3(),
        ]),
        new T.LineBasicMaterial({
          color: 0xff6a45,
          transparent: true,
          opacity: 0.7,
        }),
      );
      view.warning.visible = false;
      scene.add(view.warning);
      views.set(body.id, view);
    });
  }
  function update({ state, truth, cameraFloor, camera, dt, time }) {
    for (const e of state.entities) {
      const view = views.get(e.id);
      view.tank.position.set(e.x, e.y, e.z);
      const ramp = e.rampId ? C.MAP.ramps.find((r) => r.id === e.rampId) : null;
      const slope = ramp
        ? (C.MAP.levels[ramp.b.floor].y - C.MAP.levels[ramp.a.floor].y) /
          (ramp.b.z - ramp.a.z)
        : 0;
      view.tank.quaternion
        .setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.atan(slope))
        .multiply(
          new T.Quaternion().setFromAxisAngle(
            new T.Vector3(0, 1, 0),
            e.heading,
          ),
        );
      view.tank.visible = e.floor <= cameraFloor || Boolean(e.rampId); // Cosmetic suspension only; authority coordinates and turret aim stay untouched.
      if (view.lastSpeed === undefined) {
        view.lastSpeed = e.speed;
        view.lastHeading = e.heading;
        view.leanPitch = 0;
        view.leanRoll = 0;
        view.travel = 0;
        view.dustTime = 0;
      }
      const response = 1 - Math.exp(-dt * 9),
        acceleration = Math.max(
          -18,
          Math.min(18, (e.speed - view.lastSpeed) / Math.max(dt, 0.001)),
        ),
        angular = C.wrap(e.heading - view.lastHeading) / Math.max(dt, 0.001);
      const moving = e.alive && truth.status === "playing";
      view.leanPitch +=
        ((moving && !reduced ? -acceleration * 0.002 : 0) - view.leanPitch) *
        response;
      view.leanRoll +=
        ((moving && !reduced
          ? Math.max(-0.04, Math.min(0.04, angular * e.speed * 0.002))
          : 0) -
          view.leanRoll) *
        response;
      if (moving) view.travel += Math.abs(e.speed) * dt;
      view.tank.quaternion.multiply(
        new T.Quaternion().setFromEuler(
          new T.Euler(view.leanRoll, 0, view.leanPitch),
        ),
      );
      if (moving && !reduced)
        view.tank.position.y +=
          Math.sin(view.travel * 2.6) *
          0.025 *
          Math.min(1, Math.abs(e.speed) / 8);
      view.lastSpeed = e.speed;
      view.lastHeading = e.heading;
      view.dustTime += dt;
      if (
        moving &&
        !reduced &&
        Math.abs(e.speed) > 2 &&
        view.dustTime > 0.14 &&
        effects.length < 140
      ) {
        view.dustTime = 0;
        const m = new T.Mesh(
          sphere,
          new T.MeshBasicMaterial({
            color: 0xe4d5b1,
            transparent: true,
            opacity: 0.25,
            depthWrite: false,
          }),
        );
        m.position.set(
          e.x + Math.cos(e.heading) * 2.5,
          e.y + 0.25,
          e.z - Math.sin(e.heading) * 2.5,
        );
        m.scale.setScalar(0.3);
        scene.add(m);
        effects.push({
          m,
          age: 0,
          life: 0.65,
          size: 1.1,
          dx: Math.cos(e.heading) * 0.4,
          dz: -Math.sin(e.heading) * 0.4,
          dy: 0.55,
          opacity: 0.25,
        });
      }
      view.turret.quaternion
        .copy(view.tank.quaternion)
        .invert()
        .multiply(
          new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), e.aim),
        );
      view.gun.rotation.z = -e.pitch;
      view.recoil = Math.max(
        0,
        view.recoil - (truth.status === "playing" ? dt * 5 : 0),
      );
      view.gun.position.x =
        (view.spec.movement === "strafe" ? -0.35 : -1.12) + view.recoil * 0.28;
      for (let i = 0; i < view.limbs.length; i++)
        view.limbs[i].rotation.z =
          e.alive && !reduced
            ? Math.sin(view.travel * 2.2 + i * Math.PI) *
              0.45 *
              Math.min(1, Math.abs(e.speed) / 4)
            : 0;
      if (!e.alive && !view.dead) {
        view.dead = true;
        view.tank.traverse((o) => {
          if (o.isMesh && o !== view.shield && o !== view.frontShield)
            o.material = view.wreck;
        });
      }
      if (e.alive && view.dead) {
        view.dead = false;
        for (const [mesh, material] of view.originals) mesh.material = material;
      }
      view.shield.visible =
        e.alive && (e.protectedUntil > truth.tick || e.barrier > 0);
      view.frontShield.visible =
        e.alive &&
        C.TANKS[e.tankType].ability === "deploy" &&
        e.abilityUntil > truth.tick;
      view.warning.visible = e.alive && view.tank.visible && e.charge > 0;
      if (view.warning.visible) {
        const start = new T.Vector3(e.x, e.y + 2.2, e.z),
          direction = new T.Vector3(
            -Math.cos(e.aim) * Math.cos(e.pitch),
            Math.sin(e.pitch),
            Math.sin(e.aim) * Math.cos(e.pitch),
          );
        const warningRay = new T.Raycaster(start, direction, 0.1, 140),
          wallHit = warningRay.intersectObjects(
            floorGroups.filter((g) => g.visible),
            true,
          )[0];
        const end = start
          .clone()
          .addScaledVector(
            direction,
            wallHit ? Math.min(140, wallHit.distance) : 140,
          );
        view.warning.geometry.setFromPoints([start, end]);
        view.warning.material.opacity =
          0.35 + 0.45 * (e.charge / C.WEAPONS[e.weaponType].charge);
        if (!view.wasCharging) sound(true, 0.12);
      }
      view.wasCharging = e.charge > 0;
      view.glow.emissiveIntensity =
        (e.abilityUntil > truth.tick ? 4 : 1) +
        (e.charge / (C.WEAPONS[e.weaponType].charge || 1)) * 5;
      if (truth.status === "playing")
        for (const w of view.wheels) w.rotateY((e.speed * dt) / 0.43);
      if (view.label) {
        projected.set(e.x, e.y + 4.6, e.z).project(camera);
        const shown =
          e.alive &&
          view.tank.visible &&
          projected.z > -1 &&
          projected.z < 1 &&
          Math.abs(projected.x) < 1.1 &&
          Math.abs(projected.y) < 1.1;
        view.label.style.display = shown ? "block" : "none";
        view.label.style.left =
          (projected.x * 0.5 + 0.5) * window.innerWidth + "px";
        view.label.style.top =
          (-projected.y * 0.5 + 0.5) * window.innerHeight + "px";
        view.bar.style.width =
          ((e.hp + e.shield + e.barrier) /
            (e.maxHp + C.TANKS[e.tankType].shield + e.barrier)) *
            100 +
          "%";
      }
    }
    const liveIds = new Set(state.bullets.map((b) => b.id));
    for (const [id, m] of bullets)
      if (!liveIds.has(id)) {
        scene.remove(m);
        bullets.delete(id);
      }
    for (const b of state.bullets) {
      let m = bullets.get(b.id);
      if (!m) {
        m = new T.Mesh(sphere, shellMat);
        m.scale.set(
          C.WEAPONS[b.weaponType].splashDamage ? 0.27 : 0.15,
          C.WEAPONS[b.weaponType].splashDamage ? 0.27 : 0.15,
          C.WEAPONS[b.weaponType].splashDamage ? 1.1 : 0.7,
        );
        scene.add(m);
        bullets.set(b.id, m);
      }
      if (
        C.WEAPONS[b.weaponType].splashDamage &&
        !reduced &&
        effects.length < 160 &&
        (m.userData.trailAt === undefined || time - m.userData.trailAt > 80)
      ) {
        m.userData.trailAt = time;
        const smoke = new T.Mesh(
          sphere,
          new T.MeshBasicMaterial({
            color: 0xe4d5b1,
            transparent: true,
            opacity: 0.45,
            depthWrite: false,
          }),
        );
        smoke.position.set(b.x, b.y, b.z);
        scene.add(smoke);
        effects.push({
          m: smoke,
          age: 0,
          life: 0.5,
          size: 0.8,
          dx: 0,
          dz: 0,
          dy: 0.5,
          opacity: 0.45,
        });
      }
      m.position.set(b.x, b.y, b.z);
      m.quaternion.setFromUnitVectors(
        new T.Vector3(0, 0, 1),
        new T.Vector3(b.dx, b.dy, b.dz).normalize(),
      );
    }
  }
  return { views, bullets, createViews, update };
};
