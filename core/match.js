(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).match = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { RULES, DT, TANKS, WEAPONS } = C;
  function respawnAndPickups(battle) {
    for (const body of battle.entities) {
      if (
        !body.alive &&
        !body.forfeited &&
        battle.mode !== "pve" &&
        body.respawnAt &&
        battle.tick >= body.respawnAt
      ) {
        const candidates = battle.map.spawns
          .filter((s) => battle.valid(s.x, s.z, s.floor, body))
          .map((s) => ({
            s,
            safety: Math.min(
              ...battle.entities
                .filter((e) => e.alive && e.id !== body.id)
                .map(
                  (e) =>
                    Math.hypot(e.x - s.x, e.z - s.z) +
                    Math.abs(e.floor - s.floor) * 30,
                ),
              200,
            ),
          }))
          .sort((a, b) => b.safety - a.safety);
        if (candidates.length) {
          const s = candidates[0].s;
          Object.assign(body, {
            x: s.x,
            z: s.z,
            y: C.groundHeight(battle.map,s.x,s.z,s.floor),
            floor: s.floor,
            alive: true,
            hp: body.maxHp,
            shield: TANKS[body.tankType].shield,
            barrier: 0,
            lastDamageTick: battle.tick,
            abilityCooldown: 0,
            abilityUntil: 0,
            abilityHeld: true,
            speed: 0,
            falling: false,
            fallVelocity: 0,
            fallVX: 0,
            fallVZ: 0,
            rampId: null,
            rampDir: 0,
            ammo: WEAPONS[body.weaponType].magazineSize || 0,
            cooldown: 0,
            charge: 0,
            criticalProgress: 0,
            fireHeld: false,
            needsRelease: true,
            respawnAt: 0,
            protectedUntil: battle.tick + RULES.protection,
          });
          body.brain = { target: null, path: [], pathTick: 0, blocked: 0 };
          battle.emit("respawn", { id: body.id });
        }
      }
      if (!body.alive || body.tankType === "zombie" || body.rampId || body.falling) continue;
      for (const pickup of battle.pickups) {
        if (
          pickup.readyAt > battle.tick ||
          pickup.floor !== body.floor ||
          Math.hypot(body.x - pickup.x, body.z - pickup.z) > 3
        )
          continue;
        if (pickup.kind === "repair") {
          if (body.hp === body.maxHp) continue;
          body.hp = Math.min(body.maxHp, body.hp + RULES.repair);
        } else body.boostUntil = battle.tick + RULES.boost;
        pickup.readyAt = battle.tick + RULES.pickupCooldown;
        battle.emit("pickup", {
          id: body.id,
          pickupId: pickup.id,
          kind: pickup.kind,
        });
      }
    }
  }
  function projectiles(battle) {
    const alive = [];
    for (const shot of battle.bullets) {
      const speed = WEAPONS[shot.weaponType].speed,
        end = {
          x: shot.x + shot.dx * speed * DT,
          y: shot.y + shot.dy * speed * DT,
          z: shot.z + shot.dz * speed * DT,
        };
      const hit = battle.collision(shot, end, shot.owner);
      shot.life--;
      if (hit) {
        battle.resolveHit(hit, shot);
        continue;
      }
      Object.assign(shot, end);
      if (
        shot.life > 0 &&
        Math.abs(shot.x) < battle.map.worldLimit &&
        Math.abs(shot.z) < battle.map.worldLimit &&
        shot.y > -2 &&
        shot.y < 50
      )
        alive.push(shot);
    }
    battle.bullets = alive;
  }
  function finish(battle) {
    const contenders = battle.entities.filter((e) => !e.forfeited),
      ranked = contenders
        .slice()
        .sort(
          (a, b) =>
            b.kills - a.kills ||
            a.deaths - b.deaths ||
            a.id.localeCompare(b.id),
        );
    if (
      battle.tick >= RULES.duration ||
      ranked[0]?.kills >= RULES.killLimit ||
      contenders.length <= 1
    ) {
      battle.status = "finished";
      const first = ranked[0],
        second = ranked[1];
      battle.winnerId =
        first &&
        (!second ||
          first.kills !== second.kills ||
          first.deaths !== second.deaths)
          ? first.id
          : null;
      battle.emit("end", { winnerId: battle.winnerId });
    }
  }
  return { respawnAndPickups, projectiles, finish };
});
