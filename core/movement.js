(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).movement = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { ABILITIES, RULES, TICK_RATE, DT, TANKS, WEAPONS, wrap, turn, clamp } =
    C;
  function tickEntity(battle, body, input) {
    if (input.cancelFire) {
      input = { ...input, fire: false };
      body.charge = 0;
      body.fireHeld = false;
      body.abilityHeld = false;
      body.needsRelease = true;
    }
    const spec = TANKS[body.tankType],
      weapon = WEAPONS[body.weaponType],
      ability = ABILITIES[spec.ability];
    if (body.falling) battle.tickFall(body);
    if (!body.alive) return;
    if (body.abilityCooldown) body.abilityCooldown--;
    if (body.abilityUntil <= battle.tick) body.barrier = 0;
    if (
      !body.falling &&
      input.ability &&
      !body.abilityHeld &&
      !body.abilityCooldown
    ) {
      body.abilityCooldown = spec.abilityCooldown;
      body.abilityUntil = battle.tick + spec.abilityDuration;
      if (ability.barrier) body.barrier = ability.barrier;
      battle.emit("ability", { id: body.id, ability: spec.ability });
    }
    body.abilityHeld = input.ability === true;
    if (battle.tick - body.lastDamageTick >= RULES.shieldDelay)
      body.shield = Math.min(
        spec.shield,
        body.shield + spec.shield / (6 * TICK_RATE),
      );
    if (body.cooldown) body.cooldown--;
    if (!input.fire) body.needsRelease = false;
    if (!body.falling) {
      const strafe = spec.movement === "strafe" && body.controller === "human";
      if (!strafe)
        body.heading = wrap(
          body.heading +
            ((input.left ? 1 : 0) - (input.right ? 1 : 0)) * spec.turn * DT,
        );
      const active = body.abilityUntil > battle.tick,
        throttle = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0);
      let desired = input.brake
        ? 0
        : throttle > 0
          ? spec.speed * (body.boostUntil > battle.tick ? 1.35 : 1)
          : throttle < 0
            ? -spec.reverse
            : 0;
      if (strafe) {
        const forward = (input.forward ? 1 : 0) - (input.reverse ? 1 : 0),
          side = (input.right ? 1 : 0) - (input.left ? 1 : 0),
          yaw = input.moveYaw ?? body.aim;
        if (forward || side)
          body.heading = wrap(yaw - Math.atan2(side, forward));
        desired = input.brake
          ? 0
          : forward || side
            ? spec.speed * (body.boostUntil > battle.tick ? 1.35 : 1)
            : 0;
      }
      if (active) {
        desired *= ability.speedFactor;
        if (ability.burstSpeed) {
          desired = input.brake
            ? 0
            : (ability.allowReverse && input.reverse ? -1 : 1) *
              ability.burstSpeed;
          body.speed = desired;
        }
      }
      body.speed += clamp(
        desired - body.speed,
        -spec.accel * DT,
        spec.accel * DT,
      );
      if (input.brake) body.speed = 0;
      const nx = body.x - Math.cos(body.heading) * body.speed * DT,
        nz = body.z + Math.sin(body.heading) * body.speed * DT;
      const surface = battle.surface(body, nx, nz);
      if (
        surface &&
        battle.valid(nx, nz, surface.floor, body, { surface, allowDrop: true })
      ) {
        const wasFalling = body.falling;
        const oldRamp = body.rampId,
          oldFloor = body.floor;
        Object.assign(body, { x: nx, z: nz, ...surface });
        if (body.falling && !wasFalling) {
          body.fallVelocity = 0;
          body.fallVX = -Math.cos(body.heading) * body.speed;
          body.fallVZ = Math.sin(body.heading) * body.speed;
          battle.emit("fallStart", { id: body.id });
        }
        body.brain.blocked = 0;
        if (oldRamp !== body.rampId) {
          body.brain.path = [];
          body.brain.pathTick = 0;
          if (oldRamp)
            battle.emit("rampExit", { id: body.id, floor: body.floor });
          else battle.emit("rampEnter", { id: body.id, rampId: body.rampId });
        }
        if (oldFloor !== body.floor) body.brain.pathTick = 0;
      } else {
        if (Math.abs(body.speed) > 0.1) body.brain.blocked++;
        body.speed = 0;
      }
    }
    if (input.aimLeft || input.aimRight)
      body.aim = wrap(
        body.aim +
          ((input.aimLeft ? 1 : 0) - (input.aimRight ? 1 : 0)) * 1.8 * DT,
      );
    else if (input.aimYaw !== undefined)
      body.aim = turn(
        body.aim,
        input.aimYaw,
        (body.controller === "bot" ? 1.8 : 2.8) * DT,
      );
    if (input.aimPitch !== undefined)
      body.pitch += clamp(input.aimPitch - body.pitch, -1.6 * DT, 1.6 * DT);
    if (weapon.trigger === "delayed") {
      // A rising edge commits one fixed warm-up. Releasing never changes damage or timing.
      if (
        body.charge ||
        (input.fire && !body.fireHeld && !body.needsRelease && !body.cooldown)
      ) {
        body.charge++;
        if (body.charge >= weapon.charge) {
          battle.shoot(body);
          body.needsRelease = true;
        }
      }
    } else if (weapon.trigger === "charge") {
      if (input.fire && !body.needsRelease && !body.cooldown) {
        body.charge = Math.min(weapon.charge, body.charge + 1);
        if (body.charge === weapon.charge) {
          battle.shoot(body);
          body.needsRelease = true;
        }
      } else if (!input.fire && body.fireHeld && body.charge) {
        if (body.charge >= weapon.minCharge && !body.cooldown)
          battle.shoot(
            body,
            weapon.minPower +
              ((1 - weapon.minPower) * body.charge) / weapon.charge,
          );
        body.charge = 0;
      }
    } else if (input.fire) battle.shoot(body);
    body.fireHeld = input.fire === true;
  }
  return { tickEntity };
});
