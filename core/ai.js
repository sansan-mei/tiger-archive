(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).ai = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { wrap, clamp } = C;
  // Shared by battles using the same map; never serialized into checkpoints.
  const navigation = new WeakMap();
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
    // Maps are normally static. Detect edits to collision data as well as map
    // replacement so custom maps cannot reuse stale cells or edges.
    const signature = JSON.stringify([battle.map.levels, battle.map.obstacles, battle.map.ramps]);
    let cache = navigation.get(battle.map);
    if (!cache || cache.signature !== signature) {
      cache = { signature, profiles: new Map() };
      navigation.set(battle.map, cache);
    }
    const spec = C.TANKS[body.tankType];
    const profile = `${floor}:${spec.radius}:${spec.height || 3}`;
    let grid = cache.profiles.get(profile);
    if (!grid) {
      const cells = [];
      for (let z = 0; z < n; z++)
        for (let x = 0; x < n; x++) {
          const p = { x, z }, point = world(p);
          if (battle.valid(point.x, point.z, floor, body, {
            ignoreEntities: true, margin: 0.5,
          })) cells.push(p);
        }
      grid = { cells, passable: new Set(cells.map(key)), edges: new Map() };
      cache.profiles.set(profile, grid);
    }
    const { cells, passable, edges } = grid;
    let start, goal, startDistance = Infinity, goalDistance = Infinity;
    for (const cell of cells) {
      const point = world(cell),
        fromDistance = Math.hypot(point.x - body.x, point.z - body.z),
        toDistance = Math.hypot(point.x - to.x, point.z - to.z);
      // Cells are ordered by key, preserving the original distance tie-break.
      if (fromDistance < startDistance) { start = cell; startDistance = fromDistance; }
      if (toDistance < goalDistance) { goal = cell; goalDistance = toDistance; }
    }
    if (start && !clear(body, world(start))) {
      // Only unusual starts beside a wall need the ordered fallback search.
      start = cells.map(cell => ({ cell, distance: Math.hypot(
        world(cell).x - body.x, world(cell).z - body.z,
      ) })).sort((a, b) => a.distance - b.distance || key(a.cell) - key(b.cell))
        .find(({ cell }) => clear(body, world(cell)))?.cell;
    }
    if (!start || !goal) return [];
    const open = [{ ...start, g: 0, f: 0 }],
      best = new Map([[key(start), 0]]),
      parent = new Map(),
      closed = new Set();
    // A min-heap keeps the original f/key order without sorting every expansion.
    const compare = (a, b) => a.f - b.f || key(a) - key(b);
    function push(node) {
      let i = open.length;
      open.push(node);
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (compare(open[p], node) <= 0) break;
        open[i] = open[p]; i = p;
      }
      open[i] = node;
    }
    function pop() {
      const first = open[0], last = open.pop();
      if (open.length) {
        let i = 0;
        while (i * 2 + 1 < open.length) {
          let child = i * 2 + 1;
          if (child + 1 < open.length && compare(open[child + 1], open[child]) < 0) child++;
          if (compare(last, open[child]) <= 0) break;
          open[i] = open[child]; i = child;
        }
        open[i] = last;
      }
      return first;
    }
    let found = null;
    while (open.length) {
      const cur = pop(),
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
        // Directed edges retain the exact sampling order of the old clearance test.
        const edge = id * n * n + key(next);
        if (!edges.has(edge)) edges.set(edge, clear(world(cur), world(next), 0.5));
        if (!edges.get(edge)) continue;
        const k = key(next),
          g = cur.g + 1;
        if (g >= (best.get(k) ?? Infinity)) continue;
        parent.set(k, id);
        best.set(k, g);
        push({
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
    const zombie = battle.mode === "pve" && body.tankType === "zombie",
      zombieOrdinal = zombie ? Number(body.id.slice(7)) || 0 : 0,
      recovering = zombie && body.brain.blocked === 12;
    const attack = zombie && battle.pve.enemyAttacks.find(a=>a.owner===body.id);
    if(attack?.phase==='warn'||attack?.phase==='stun')return {brake:true};
    if(attack?.phase==='dash')return {forward:true};
    if (recovering) {
      body.brain.path = [];
      body.brain.pathTick = 0;
      body.brain.target = null;
    }
    const targets = battle.entities.filter((e) => e.id !== body.id && e.alive && (!zombie || e.tankType !== "zombie"));
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
    if (zombie && range < (C.unitSpec(body).meleeRange || 2.1) && Math.abs(target.y - body.y) < 1.5 && los) {
      if (!body.cooldown) {
        battle.damage(target, C.unitSpec(body).meleeDamage + Math.min(16, battle.pve.wave * 2), body.id, { x: target.x, y: target.y + 1, z: target.z });
        body.cooldown = C.unitSpec(body).meleeCooldown;
      }
      return { ...input, brake: true };
    }
    if (body.falling) {
      input.fire =
        !zombie && los &&
        range < 60 &&
        (C.WEAPONS[body.weaponType].trigger !== "delayed" || !body.fireHeld);
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
    } else if (zombie && range > 1.8) {
      if (["boss", "titan"].includes(body.zombieType)) goal = target;
      else {
        const slot = zombieOrdinal % 6,
          angle = (slot * Math.PI * 2) / 6,
          attackPoint = {
            id: `${target.id}:attack:${slot}`,
            x: target.x + Math.cos(angle) * 1.85,
            z: target.z + Math.sin(angle) * 1.85,
          };
        goal = battle.valid(attackPoint.x, attackPoint.z, target.floor, body, {
          ignoreEntities: true,
        })
          ? attackPoint
          : target;
      }
      direct = los && !recovering && body.brain.blocked < 12 && !body.brain.path.length;
    } else if (!los || range > 31) {
      goal = target;
    }
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
      !zombie && !body.rampId &&
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
        (!zombie ||
          battle.tick % battle.entities.filter(e=>e.tankType==="zombie").length === zombieOrdinal) &&
        (battle.tick >= body.brain.pathTick || body.brain.target !== goalKey)
      ) {
        body.brain.path = battle.route(body, goal);
        body.brain.pathTick = battle.tick + (zombie ? 90 : 240);
        body.brain.target = goalKey;
      }
      const zombieSpec = zombie ? C.unitSpec(body) : null,
        waypointReach = zombie
          ? Math.max(0.75, zombieSpec.speed / zombieSpec.turn * 1.25)
          : 0.75;
      while (
        body.brain.path.length &&
        Math.hypot(
          body.brain.path[0].x - body.x,
          body.brain.path[0].z - body.z,
        ) < waypointReach
      )
        body.brain.path.shift();
      const next = direct ? goal : body.brain.path[0] || goal,
        desired = Math.atan2(next.z - body.z, -(next.x - body.x)),
        diff = wrap(desired - body.heading);
      input.left = diff > 0.1;
      input.right = diff < -0.1;
      input.forward = zombie || Math.abs(diff) < 0.18;
      input.brake = !input.forward;
      if (body.brain.blocked > 20) {
        input.forward = false;
        input.reverse = true;
        input.left = !zombie || zombieOrdinal % 2 === 0;
        input.right = zombie && zombieOrdinal % 2 === 1;
        if (body.brain.blocked > 48) {
          body.brain.path = [];
          body.brain.pathTick = 0;
          body.brain.target = null;
          body.brain.blocked = 0;
        }
      }
    }
    if (
      !zombie && los &&
      range < 95 &&
      Math.abs(wrap(aimYaw - body.aim)) < 0.09 &&
      !body.cooldown
    )
      input.fire =
        C.WEAPONS[body.weaponType].trigger !== "delayed" || !body.fireHeld;
    input.ability =
      !zombie && body.abilityCooldown === 0 &&
      !body.abilityHeld &&
      (body.tankType === "light" ? !!goal : los && range < 55);
    return input;
  }
  return { route, botInput };
});
