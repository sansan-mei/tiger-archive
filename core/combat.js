(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).combat = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { ABILITIES, RULES, TANKS, WEAPONS } = C;
  function damage(
    battle,
    target,
    amount,
    owner,
    point,
    direction = null,
    critical = false,
  ) {
    if (!target.alive || target.protectedUntil > battle.tick) return false;
    if (battle.mode === "pve") {
      const source = battle.getEntity(owner);
      if (source && (source.tankType === "zombie") === (target.tankType === "zombie")) return false;
    }
    const attacker = battle.getEntity(owner),
      spec = TANKS[target.tankType],
      ability = ABILITIES[spec.ability];
    const dx = direction ? -direction.x : (attacker?.x ?? point.x) - target.x,
      dz = direction ? -direction.z : (attacker?.z ?? point.z) - target.z;
    const frontal =
      ability.damageFactor < 1 &&
      target.abilityUntil > battle.tick &&
      (-Math.cos(target.aim) * dx + Math.sin(target.aim) * dz) /
        Math.max(0.001, Math.hypot(dx, dz)) >=
        ability.frontDot;
    if (frontal) amount = Math.ceil(amount * ability.damageFactor);
    target.lastDamageTick = battle.tick;
    const barrierDamage = Math.min(target.barrier, amount);
    target.barrier -= barrierDamage;
    amount -= barrierDamage;
    const shieldDamage = Math.min(target.shield, amount);
    target.shield -= shieldDamage;
    amount -= shieldDamage;
    const hullDamage = Math.min(target.hp, amount);
    target.hp -= hullDamage;
    battle.emit("damage", {
      id: target.id,
      owner,
      hp: target.hp,
      amount: hullDamage + shieldDamage + barrierDamage,
      shieldDamage: shieldDamage + barrierDamage,
      frontal,
      critical,
      ...point,
    });
    if (!target.hp) {
      target.alive = false;
      target.deaths++;
      target.respawnAt = battle.mode === "pve" ? 0 : battle.tick + RULES.respawn;
      target.boostUntil = 0;
      target.abilityUntil = 0;
      target.barrier = 0;
      target.speed = 0;
      target.charge = 0;
      target.criticalProgress = 0;
      const killer = battle.getEntity(owner);
      if (killer && killer !== target) killer.kills++;
      battle.emit("destroy", {
        id: target.id,
        owner,
        x: target.x,
        y: target.y + 1.5,
        z: target.z,
      });
    }
    return true;
  }
  function resolveHit(battle, hit, shot) {
    battle.emit("impact", {
      owner: shot.owner,
      kind: hit.kind,
      targetId: hit.kind === "tank" ? hit.id : null,
      ...hit.point,
      weaponType: shot.weaponType,
    });
    const spec = WEAPONS[shot.weaponType];
    if (hit.kind === "tank") {
      const applied = battle.damage(
        battle.getEntity(hit.id),
        shot.damage,
        shot.owner,
        hit.point,
        { x: shot.dx, z: shot.dz },
        shot.critical === true,
      );
      const owner = battle.getEntity(shot.owner);
      // Old projectiles may still hurt, but cannot charge a dead or respawned shooter.
      if (
        applied &&
        spec.criticalHits &&
        !shot.critical &&
        owner?.alive &&
        owner.id !== hit.id &&
        owner.deaths === shot.ownerLife &&
        owner.weaponType === shot.weaponType
      )
        owner.criticalProgress = Math.min(
          spec.criticalHits,
          owner.criticalProgress + 1,
        );
    }
    if (spec.splashDamage) {
      battle.emit("explosion", {
        owner: shot.owner,
        ...hit.point,
        radius: spec.splashRadius,
      });
      // Start outside the impacted surface so the wall itself blocks its far side.
      const origin = {
        x: hit.point.x - shot.dx * 0.03,
        y: hit.point.y - shot.dy * 0.03,
        z: hit.point.z - shot.dz * 0.03,
      };
      for (const target of battle.entities) {
        if (!target.alive) continue;
        const center = { x: target.x, y: target.y + 1.5, z: target.z },
          direct = hit.kind === "tank" && hit.id === target.id;
        const distance = Math.max(
          0,
          Math.hypot(
            center.x - hit.point.x,
            center.y - hit.point.y,
            center.z - hit.point.z,
          ) - TANKS[target.tankType].radius,
        );
        if (
          !direct &&
          (distance >= spec.splashRadius ||
            battle.collision(origin, center, null, { bodies: false }))
        )
          continue;
        const amount = direct
          ? spec.splashDamage
          : Math.max(
              1,
              Math.round(
                spec.splashDamage * (1 - distance / spec.splashRadius),
              ),
            );
        battle.damage(
          target,
          amount,
          shot.owner,
          center,
          direct
            ? { x: shot.dx, z: shot.dz }
            : { x: center.x - origin.x, z: center.z - origin.z },
        );
      }
    }
  }
  function shoot(battle, body, power = 1) {
    if (battle.status !== "playing" || !body.alive || body.cooldown)
      return false;
    body.protectedUntil = 0;
    body.lastDamageTick = battle.tick;
    const spec = WEAPONS[body.weaponType],
      c = Math.cos(body.pitch),
      dir = {
        x: -Math.cos(body.aim) * c,
        y: Math.sin(body.pitch),
        z: Math.sin(body.aim) * c,
      };
    const start = { x: body.x, y: body.y + 2.2, z: body.z },
      length =
        spec.muzzle *
        TANKS[body.tankType].scale *
        (TANKS[body.tankType].muzzleScale || 1);
    const muzzle = {
      x: start.x + dir.x * length,
      y: start.y + dir.y * length,
      z: start.z + dir.z * length,
    };
    if (spec.trigger === "delayed") power = 1;
    body.cooldown = Math.round(spec.cooldown * (1 - 0.1 * (battle.pve?.upgrades[body.id]?.haste || 0)));
    body.charge = 0;
    const critical =
      !!spec.criticalHits && body.criticalProgress >= spec.criticalHits;
    if (critical) body.criticalProgress = 0;
    const shot = {
      id: battle.nextBullet++,
      owner: body.id,
      weaponType: body.weaponType,
      critical,
      ownerLife: body.deaths,
      damage: Math.round(
        spec.damage * power * (critical ? spec.criticalMultiplier : 1),
      ),
      ...muzzle,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      life: spec.life,
    };
    battle.emit("shot", {
      critical,
      id: body.id,
      weaponType: body.weaponType,
      power,
      ...muzzle,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
    });
    const beamRadius = spec.delivery === "ray" ? spec.beamRadius || 0 : 0;
    const near = battle.collision(start, muzzle, body.id, {
      radius: beamRadius,
    });
    if (spec.delivery === "ray") {
      const end = {
          x: start.x + dir.x * spec.range,
          y: start.y + dir.y * spec.range,
          z: start.z + dir.z * spec.range,
        },
        hit =
          near ||
          battle.collision(muzzle, end, body.id, { radius: beamRadius });
      battle.emit("beam", {
        id: body.id,
        radius: beamRadius,
        from: muzzle,
        to: hit ? hit.point : end,
        power,
      });
      if (hit) battle.resolveHit(hit, shot);
    } else if (near) battle.resolveHit(near, shot);
    else battle.bullets.push(shot);
    return true;
  }
  return { damage, resolveHit, shoot };
});
