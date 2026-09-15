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
    if (battle.pve?.scatterMarks?.[target.id]?.until > battle.tick) amount *= 1.15;
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
    const branch = battle.pve?.branchState?.[target.id];
    const guardDamage = branch && branch.guardUntil>battle.tick ? Math.min(branch.guard,amount) : 0;
    if(guardDamage){branch.guard-=guardDamage;amount-=guardDamage;}
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
      amount: hullDamage + shieldDamage + barrierDamage + guardDamage,
      shieldDamage: shieldDamage + barrierDamage + guardDamage,
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
      if (battle.mode === "pve") battle.pveDeath(target, owner);
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
    const owner = battle.getEntity(shot.owner), base = WEAPONS[shot.weaponType],
      routeActive = battle.mode === "pve" && owner?.weaponType === shot.weaponType,
      moduleActive = battle.mode === "pve" && owner?.deaths === shot.ownerLife,
      upgrades = routeActive ? battle.pve.upgrades[shot.owner] : null,
      nuclear = shot.weaponType === "rocket" && upgrades?.doomsday && shot.doomsday,
      chainBudget = routeActive && shot.weaponType === "rocket" ? {owner:shot.owner,remaining:3} : null;
    if(chainBudget)battle.pveChainBudget=chainBudget;
    const spec = shot.weaponType === "rocket" && routeActive
      ? { ...base, splashRadius: nuclear ? 16 : upgrades.blast ? 10 : base.splashRadius,
          splashDamage: upgrades.napalm ? Math.round((upgrades.blast?100:base.splashDamage)*.6) : nuclear ? 500 : upgrades.fire ? 200 : upgrades.blast ? 100 : base.splashDamage }
      : base;
    if (hit.kind === "tank") {
      const target = battle.getEntity(hit.id), wasAlive = target?.alive,
        statusBefore=moduleActive&&target?{wasAlive,burning:(battle.pve.moduleStatus[target.id]?.burnUntil||0)>battle.tick,
          slowed:target.slowUntil>battle.tick}:null,
        baseDamage = Math.round(base.damage * (shot.critical ? base.criticalMultiplier || 1 : 1)),
        applied = battle.damage(
          target,
          moduleActive ? battle.pveModuleDamage(target,shot,routeActive?shot.damage:baseDamage) :
            routeActive ? shot.damage : baseDamage,
          shot.owner,
          hit.point,
          { x: shot.dx, z: shot.dz },
          shot.critical === true,
        );
      if (applied && battle.mode === "pve") {
        if(statusBefore)statusBefore.directKilled=!!wasAlive&&!target.alive;
        battle.pveHit(hit, shot, statusBefore);
      }
      if (routeActive && wasAlive && !target.alive) shot.pveKills = (shot.pveKills || 0) + 1;
      // Old projectiles may still hurt, but cannot charge a dead or respawned shooter.
      if (
        applied &&
        spec.criticalHits && !(shot.weaponType==='standard'&&upgrades?.shrapnel) &&
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
    if (battle.mode === "pve") battle.pveFire(hit, shot);
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
    if(chainBudget&&battle.pveChainBudget===chainBudget)battle.pveChainBudget=null;
  }
  function shoot(battle, body, power = 1) {
    if (battle.status !== "playing" || !body.alive || body.cooldown)
      return false;
    if (battle.pveWeapon(body).magazineSize && body.ammo <= 0) return false;
    body.protectedUntil = 0;
    body.lastDamageTick = battle.tick;
    const base = WEAPONS[body.weaponType],
      upgrades = battle.mode === "pve" ? battle.pve.upgrades[body.id] : null;
    let spec = battle.pveWeapon(body);
    if (body.weaponType === "laser" && upgrades?.wideBeam)
      spec = { ...spec, beamRadius: upgrades.stellar ? 1.5 : 1,
        damage: upgrades.chargeCore ? 240 : upgrades.stellar ? 250 : upgrades.capacitor ? 150 : base.damage };
    if (body.weaponType === "rapid" && upgrades?.metalStorm)
      spec = { ...spec, cooldown: Math.round(base.cooldown / 2) };
    const c = Math.cos(body.pitch),
      dir = {
        x: -Math.cos(body.aim) * c,
        y: Math.sin(body.pitch),
        z: Math.sin(body.aim) * c,
      };
    const start = C.shotOrigin(body),
      length =
        (spec.muzzle - (TANKS[body.tankType].gunMount ? 0.35 / 0.55 : 0)) *
        TANKS[body.tankType].scale *
        (TANKS[body.tankType].muzzleScale || 1);
    const muzzle = {
      x: start.x + dir.x * length,
      y: start.y + dir.y * length,
      z: start.z + dir.z * length,
    };
    if (spec.trigger === "delayed") power = 1;
    body.cooldown = body.weaponType==='standard'&&upgrades?.shrapnel ? 18 : Math.round(spec.cooldown * (1 - 0.1 * (battle.pve?.upgrades[body.id]?.haste || 0)));
    if (spec.magazineSize) {
      body.ammo--;
      if (body.ammo === 0) body.cooldown = spec.reloadTicks;
    }
    const magazineFinal = body.weaponType === "pistol" && spec.magazineSize && body.ammo === 0;
    let doomsday = false;
    if (body.weaponType === "rocket" && upgrades?.doomsday) {
      battle.pve.rocketShots[body.id] = (battle.pve.rocketShots[body.id] + 1) % 3;
      doomsday = battle.pve.rocketShots[body.id] === 0;
    }
    body.charge = 0;
    const critical =
      !!spec.criticalHits && body.criticalProgress >= spec.criticalHits;
    if (critical) body.criticalProgress = 0;
    const shot = {
      id: battle.nextBullet++,
      owner: body.id,
      weaponType: body.weaponType,
      critical,
      magazineFinal: !!magazineFinal,
      doomsday,
      ownerLife: body.deaths,
      damage: upgrades?.judgment && body.weaponType === "standard" && critical
        ? 200
        : Math.round(spec.damage * power * (critical ? spec.criticalMultiplier : 1)),
      ...muzzle,
      dx: dir.x,
      dy: dir.y,
      dz: dir.z,
      life: spec.life,
    };
    battle.pveBranch("prepare",body,shot);
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
    // Wide energy beams may graze the ground; full width still collides with cover and bodies.
    const beamRadius = spec.delivery === "ray" ? spec.beamRadius || 0 : 0;
    if (body.weaponType === "standard" && upgrades?.shrapnel) {
      battle.pveBranch("afterShot",body,shot,start);
    } else if (spec.delivery === "ray") {
      const end = {
          x: start.x + dir.x * spec.range,
          y: start.y + dir.y * spec.range,
          z: start.z + dir.z * spec.range,
        },
        hits = [],
        ignoreIds = [];
      let hit = battle.collision(start, end, body.id, {
          radius: beamRadius,
          floorRadius: Math.min(beamRadius, 0.5),
          ignoreIds,
        }),
        blocker = null;
      while (hit) {
        hits.push(hit);
        if (!spec.penetratesBodies || hit.kind !== "tank") {
          blocker = hit;
          break;
        }
        ignoreIds.push(hit.id);
        hit = battle.collision(start, end, body.id, {
          radius: beamRadius,
          floorRadius: Math.min(beamRadius, 0.5),
          ignoreIds,
        });
      }
      battle.emit("beam", {
        id: body.id,
        radius: beamRadius,
        from: muzzle,
        to: blocker ? blocker.point : end,
        power,
      });
      shot.rayTargetIds = hits.filter(hit=>hit.kind==="tank").map(hit=>hit.id);
      for (const rayHit of hits) battle.resolveHit(rayHit, shot);
      battle.pveBranch("afterShot",body,shot,start,blocker?blocker.point:end);
      if (upgrades?.stellar && (shot.pveKills || 0) >= 3)
        body.cooldown = Math.max(1, Math.ceil(body.cooldown / 2));
    } else {
      const near = battle.collision(start, muzzle, body.id);
      if (near) battle.resolveHit(near, shot);
      else battle.bullets.push(shot);
      battle.pveBranch("afterShot",body,shot,start);
    }
    return true;
  }
  return { damage, resolveHit, shoot };
});
