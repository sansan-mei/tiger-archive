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
  getMode = () => "pvp",
  getPlayerId,
}) {
  const projected = new T.Vector3();
  const views = new Map(),
    bullets = new Map(),
    palette = [
      0x62cbb1, 0xf18473, 0x70b7e6, 0xf1c566, 0xb49be0, 0x79c6cf, 0xf1a66d,
      0x92afd9,
    ];
  function createViews(onlyId = null, entities = getEntities()) {
    for (const [id, view] of views) {
      if (onlyId && id !== onlyId) continue;
      scene.remove(view.tank);
      view.label?.remove();
      view.warning?.geometry.dispose();
      view.warning?.material.dispose();
      scene.remove(view.warning);
      view.dispose();
      views.delete(id);
    }
    entities.forEach((body, i) => {
      if (onlyId && body.id !== onlyId) return;
      const view = window.createTankModel(T, {
        tankType: body.tankType,
        weaponType: body.weaponType,
        zombieType: body.zombieType,
        color: palette[i % palette.length],
      });
      view.weaponType = body.weaponType;
      view.zombieType = body.zombieType;
      view.basePaintColor = view.paint.color.clone();
      view.shield.userData.aimIgnore = true;
      view.frontShield.userData.aimIgnore = true;
      view.tank.traverse((o) => {
        o.userData.entityId = body.id;
      });
      scene.add(view.tank);
      if (body.id !== getPlayerId()) {
        const label = document.createElement("div");
        label.className = "enemy-tag";
        const text = document.createElement("span");
        text.textContent = body.id + " / " + C.unitSpec(body).name;
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
  const rayTargets = [], rayHits = [];
  function firstVisibleHit(ray, roots) {
    rayTargets.length = 0;
    rayHits.length = 0;
    function collect(node) {
      if (!node.visible || node.userData.aimIgnore) return;
      rayTargets.push(node);
      for (const child of node.children) collect(child);
    }
    for (const root of roots) {
      let visible = true;
      for (let parent = root.parent; parent; parent = parent.parent)
        if (!parent.visible || parent.userData.aimIgnore) { visible = false; break; }
      if (visible) collect(root);
    }
    // Prune entire ignored/hidden subtrees before Three.js touches their geometry.
    // Recollect on each query to respect async model replacement and visibility changes.
    const hit = ray.intersectObjects(rayTargets, false, rayHits)[0];
    rayTargets.length = 0;
    rayHits.length = 0;
    return hit;
  }
  function update({
    state,
    truth,
    cameraFloor,
    camera,
    dt,
    time,
    targetedId = null,
  }) {
    for (const e of state.entities)
      if (views.get(e.id)?.weaponType !== e.weaponType || views.get(e.id)?.zombieType !== e.zombieType) createViews(e.id, state.entities);
    for (const e of state.entities) {
      const view = views.get(e.id);
      if (e.tankType === "zombie" && !e.alive) {
        view.tank.visible = view.warning.visible = view.shield.visible = view.frontShield.visible = view.criticalGlow.visible = false;
        view.recoil = 0; view.wasCharging = false; view.lastSpeed = e.speed; view.lastHeading = e.heading;
        view.leanPitch = 0; view.leanRoll = 0; view.travel ??= 0; view.dustTime = 0; view.lastRespawnAt = e.respawnAt;
        if (view.label) { view.label.dataset.targeted = "false"; if (view.label.style.display !== "none") view.label.style.display = "none"; }
        continue;
      }
      const targeted = e.alive && e.id === targetedId && e.id !== getPlayerId();
      view.paint.color.copy(view.basePaintColor);
      if (e.slowUntil > truth.tick) view.paint.color.setHex(0x75c9e2);
      const moduleStatus=truth.mode==="pve"?truth.pve.moduleStatus?.[e.id]:null;
      if(moduleStatus?.fractureUntil>truth.tick)view.paint.color.setHex(0xe7cc68);
      if(moduleStatus?.burnUntil>truth.tick)view.paint.color.setHex(0xff8c44);
      if (targeted) view.paint.color.setHex(0xe34848);
      if (view.label) view.label.dataset.targeted = String(targeted);
      const recoil = window.TankClient.recoil;
      const profile = recoil.profiles[e.weaponType] || recoil.profiles.standard;
      if (!e.alive || (view.lastRespawnAt !== undefined && view.lastRespawnAt !== e.respawnAt))
        view.recoil = 0;
      view.lastRespawnAt = e.respawnAt;
      const impulse = view.recoil * (reduced ? 0.2 : 1);
      view.recoil = recoil.decay(view.recoil, dt, profile.recovery);
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
      view.tank.visible =
        (e.tankType !== "zombie" || e.alive) && (e.falling || e.floor <= cameraFloor || Boolean(e.rampId)); // Cosmetic suspension only; authority coordinates and turret aim stay untouched.
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
      const moving = e.alive && !e.falling && truth.status === "playing";
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
          new T.Euler(
            view.leanRoll - Math.sin(e.aim - e.heading) * impulse * profile.body,
            0,
            view.leanPitch - Math.cos(e.aim - e.heading) * impulse * profile.body,
          ),
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
          e.tankType !== "zombie" && Math.abs(e.speed) > 2 &&
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
      view.gun.position.x =
        view.gunRestPosition.x + impulse * profile.barrel;
      // Recoil follows the weapon's direction in the hull's local coordinates.
      // Infantry uses a smaller weapon stroke to match its scaled launcher.
      if (view.spec.movement === "strafe")
        view.gun.position.x -= impulse * profile.barrel * 0.45;
      const mountKick = impulse * profile.barrel * 0.18;
      view.turret.position.x = view.spec.mount[0] + Math.cos(e.aim - e.heading) * mountKick;
      view.turret.position.z = view.spec.mount[2] - Math.sin(e.aim - e.heading) * mountKick;
      for (let i = 0; i < view.limbs.length; i++)
        view.limbs[i].rotation.z =
          e.alive && !reduced
            ? Math.sin(view.travel * 2.2 + i * Math.PI) *
              0.45 *
              Math.min(1, Math.abs(e.speed) / 4)
            : 0;
      view.animateCharacter?.({
        travel: view.travel, speed: moving && !reduced ? e.speed : 0,
        aim: C.wrap(e.aim - e.heading), pitch: e.pitch,
        recoil: impulse, alive: e.alive, time: reduced ? 0 : time / 1000,
      });
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
        e.alive && e.barrier > 0;
      // Heavy deployment is armour reduction, not an energy shield.
      view.frontShield.visible = false;
      const chargeWeapon = truth.mode === "pve" ? C.PVE.progression.branches.weapon(truth,e) : C.WEAPONS[e.weaponType];
      view.warning.visible = e.alive && view.tank.visible && e.charge > 0;
      if (view.warning.visible) {
        const start = new T.Vector3().copy(C.shotOrigin(e)),
          direction = new T.Vector3(
            -Math.cos(e.aim) * Math.cos(e.pitch),
            Math.sin(e.pitch),
            Math.sin(e.aim) * Math.cos(e.pitch),
          );
        const warningRay = new T.Raycaster(start, direction, 0.1, 140),
          wallHit = firstVisibleHit(warningRay, floorGroups);
        const end = start
          .clone()
          .addScaledVector(
            direction,
            wallHit ? Math.min(140, wallHit.distance) : 140,
          );
        view.warning.geometry.setFromPoints([start, end]);
        view.warning.material.opacity =
          0.35 + 0.45 * (e.charge / chargeWeapon.charge);
        if (!view.wasCharging) sound(true, 0.12);
      }
      view.wasCharging = e.charge > 0;
      view.criticalGlow.visible =
        e.alive &&
        !!view.weapon.criticalHits &&
        e.criticalProgress >= view.weapon.criticalHits;
      view.glow.emissiveIntensity =
        (e.abilityUntil > truth.tick ? 4 : 1) +
        (e.charge / (chargeWeapon.charge || 1)) * 5;
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
          Math.abs(projected.y) < 1.1,
          display = shown ? "block" : "none";
        if (view.label.style.display !== display) view.label.style.display = display;
        if (shown && time >= (view.nextLabelAt || 0)) {
          view.nextLabelAt = time + 32;
          view.label.style.left = (projected.x * 0.5 + 0.5) * window.innerWidth + "px";
          view.label.style.top = (-projected.y * 0.5 + 0.5) * window.innerHeight + "px";
        }
        const width = ((e.hp + e.shield + e.barrier) /
          (e.maxHp + C.TANKS[e.tankType].shield + e.barrier)) * 100 + "%";
        if (view.bar.style.width !== width) view.bar.style.width = width;
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
        const rocket=C.WEAPONS[b.weaponType].splashDamage,scale=b.doomsday?.5:rocket?.27:.15;
        m.scale.set(scale,scale,b.doomsday?1.6:rocket?1.1:.7);
        m.userData.doomsday=!!b.doomsday;
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
            color: b.doomsday ? 0xb56cff : 0xe4d5b1,
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
  function aimHit(ray, floors) {
    const entities = getEntities(), live = new Set(entities.filter((e) =>
      e.alive && (getMode() !== "pve" || e.tankType === "zombie")).map((e) => e.id)), roots=[];
    for (const [id, view] of views)
      if (id !== getPlayerId() && view.tank.visible && live.has(id)) roots.push(view.tank);
    return firstVisibleHit(ray, [...roots, ...floors]);
  }
  // Recreate against the current session only after the optional library has loaded.
  // No captured entity list: room/loadout changes during the request remain safe.
  const modelsReady = window.TankModelAssets
    ? window.TankModelAssets.load(T).then((loaded) => {
        if (loaded) createViews();
        return loaded;
      })
    : Promise.resolve(false);
  return { views, bullets, createViews, update, aimHit, modelsReady };
};
