(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).ai = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { wrap, clamp } = C;
  function route(battle, body, to) {
    const floor = body.floor,
      spacing = 4,
      bound = battle.map.levels[floor].bound - 4,
      n = Math.floor((bound * 2) / spacing) + 1;
    const world = (p) => ({
        x: p.x * spacing - bound,
        z: p.z * spacing - bound,
      }),
      key = (p) => p.z * n + p.x;
    const clear = (a, b, margin = 0) => {
      const steps = Math.max(
        1,
        Math.ceil(Math.hypot(b.x - a.x, b.z - a.z) / 0.65),
      );
      for (let i = 0; i <= steps; i++)
        if (
          !battle.valid(
            a.x + ((b.x - a.x) * i) / steps,
            a.z + ((b.z - a.z) * i) / steps,
            floor,
            body,
            { ignoreEntities: true, margin },
          )
        )
          return false;
      return true;
    };
    // Snap to a reachable free cell, not merely the closest grid coordinate:
    // a tank can legally stand beside a wall whose nearest grid cell is occupied.
    const cells = [];
    for (let z = 0; z < n; z++)
      for (let x = 0; x < n; x++) {
        const p = { x, z },
          point = world(p);
        if (
          battle.valid(point.x, point.z, floor, body, {
            ignoreEntities: true,
            margin: 0.5,
          })
        )
          cells.push(p);
      }
    const sorted = cells
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(world(a).x - body.x, world(a).z - body.z) -
            Math.hypot(world(b).x - body.x, world(b).z - body.z) ||
          key(a) - key(b),
      );
    const start = sorted.find((p) => clear(body, world(p)));
    const goal = cells
      .slice()
      .sort(
        (a, b) =>
          Math.hypot(world(a).x - to.x, world(a).z - to.z) -
            Math.hypot(world(b).x - to.x, world(b).z - to.z) || key(a) - key(b),
      )[0];
    if (!start || !goal) return [];
    const passable = new Set(cells.map(key)),
      open = [{ ...start, g: 0, f: 0 }],
      best = new Map([[key(start), 0]]),
      parent = new Map(),
      closed = new Set();
    let found = null;
    while (open.length) {
      open.sort((a, b) => a.f - b.f || key(a) - key(b));
      const cur = open.shift(),
        id = key(cur);
      if (closed.has(id)) continue;
      closed.add(id);
      if (cur.x === goal.x && cur.z === goal.z) {
        found = id;
        break;
      }
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const next = { x: cur.x + dx, z: cur.z + dz };
        if (
          next.x < 0 ||
          next.z < 0 ||
          next.x >= n ||
          next.z >= n ||
          !passable.has(key(next))
        )
          continue;
        if (!clear(world(cur), world(next), 0.5)) continue;
        const k = key(next),
          g = cur.g + 1;
        if (g >= (best.get(k) ?? Infinity)) continue;
        parent.set(k, id);
        best.set(k, g);
        open.push({
          ...next,
          g,
          f: g + Math.abs(next.x - goal.x) + Math.abs(next.z - goal.z),
        });
      }
    }
    if (found === null) return [];
    const path = [];
    for (let id = found; ; id = parent.get(id)) {
      if (id === undefined) return [];
      path.push(world({ x: id % n, z: Math.floor(id / n) }));
      if (id === key(start)) break;
    }
    path.reverse();
    if (clear(world(goal), to)) path.push({ x: to.x, z: to.z });
    return path;
  }
  function botInput(battle, body) {
    if (!body.alive) return {};
    const targets = battle.entities.filter((e) => e.id !== body.id && e.alive);
    targets.sort(
      (a, b) =>
        Math.abs(a.floor - body.floor) * 100 +
          Math.hypot(a.x - body.x, a.z - body.z) -
          (Math.abs(b.floor - body.floor) * 100 +
            Math.hypot(b.x - body.x, b.z - body.z)) || a.id.localeCompare(b.id),
    );
    const target = targets[0];
    if (!target) return {};
    const dx = target.x - body.x,
      dz = target.z - body.z,
      range = Math.hypot(dx, dz),
      los = battle.sight(body, target);
    const aimYaw = Math.atan2(dz, -dx),
      aimPitch = Math.atan2(target.y - body.y, Math.max(1, range));
    const input = { aimYaw, aimPitch: clamp(aimPitch, -0.55, 0.55) };
    if (body.falling) {
      input.fire = los && range < 60;
      return input;
    }
    let goal = null,
      direct = false;
    if (body.rampId) {
      const r = battle.map.ramps.find((r) => r.id === body.rampId),
        to = body.rampDir > 0 ? r.b : r.a;
      goal = { x: to.x, z: to.z + Math.sign(r.b.z - r.a.z) * body.rampDir * 4 };
      direct = true;
    } else if (body.floor !== target.floor) {
      const dir = Math.sign(target.floor - body.floor),
        portal = battle
          .rampOptions(body)
          .find((p) => Math.sign(p.to.floor - body.floor) === dir);
      if (portal) {
        goal = portal.from;
        if (
          Math.abs(body.x - goal.x) < 1.2 &&
          (body.z - goal.z) * Math.sign(portal.to.z - goal.z) > -1 &&
          (body.z - goal.z) * Math.sign(portal.to.z - goal.z) < 5
        ) {
          goal = portal.to;
          direct = true;
        }
      }
    } else if (!los || range > 31) goal = target;
    const supply = battle.pickups
      .filter(
        (p) =>
          p.floor === body.floor &&
          p.readyAt <= battle.tick &&
          (p.kind === "repair"
            ? body.hp < body.maxHp * 0.65
            : body.boostUntil <= battle.tick),
      )
      .sort(
        (a, b) =>
          Math.hypot(body.x - a.x, body.z - a.z) -
          Math.hypot(body.x - b.x, body.z - b.z),
      )[0];
    if (
      !body.rampId &&
      supply &&
      Math.hypot(body.x - supply.x, body.z - supply.z) < 28
    ) {
      goal = supply;
      direct = false;
    }
    const goalKey = goal?.id || target.id;
    if (goal) {
      if (
        !direct &&
        (battle.tick >= body.brain.pathTick || body.brain.target !== goalKey)
      ) {
        body.brain.path = battle.route(body, goal);
        body.brain.pathTick = battle.tick + 240;
        body.brain.target = goalKey;
      }
      while (
        body.brain.path.length &&
        Math.hypot(
          body.brain.path[0].x - body.x,
          body.brain.path[0].z - body.z,
        ) < 0.75
      )
        body.brain.path.shift();
      const next = direct ? goal : body.brain.path[0] || goal,
        desired = Math.atan2(next.z - body.z, -(next.x - body.x)),
        diff = wrap(desired - body.heading);
      input.left = diff > 0.1;
      input.right = diff < -0.1;
      input.forward = Math.abs(diff) < 0.18;
      input.brake = !input.forward;
      if (body.brain.blocked > 20) {
        input.forward = false;
        input.reverse = true;
        input.left = true;
        if (body.brain.blocked > 48) body.brain.blocked = 0;
      }
    }
    if (
      los &&
      range < 95 &&
      Math.abs(wrap(aimYaw - body.aim)) < 0.09 &&
      !body.cooldown
    )
      input.fire = true;
    input.ability =
      body.abilityCooldown === 0 &&
      !body.abilityHeld &&
      (body.tankType === "light" ? !!goal : los && range < 55);
    return input;
  }
  return { route, botInput };
});
