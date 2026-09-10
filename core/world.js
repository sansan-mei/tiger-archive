(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).world = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { TANKS, slabHit, deckRects, rampHeight } = C;
  function surface(battle, body, x, z) {
    const radius = TANKS[body.tankType].radius;
    const flat = (floor) => ({
      floor,
      y: battle.map.levels[floor].y,
      rampId: null,
      rampDir: 0,
    });
    if (body.rampId) {
      const r = battle.map.ramps.find((r) => r.id === body.rampId),
        u = (z - r.a.z) / (r.b.z - r.a.z);
      if (Math.abs(x - r.a.x) > r.width / 2 - radius) return null;
      if (u <= 0) return flat(r.a.floor);
      if (u >= 1) return flat(r.b.floor);
      return {
        floor: r.a.floor,
        y: rampHeight(battle.map, r, z),
        rampId: r.id,
        rampDir: body.rampDir,
      };
    }
    for (const r of battle.map.ramps) {
      if (body.floor !== r.a.floor && body.floor !== r.b.floor) continue;
      const u = (z - r.a.z) / (r.b.z - r.a.z),
        old = (body.z - r.a.z) / (r.b.z - r.a.z);
      if (u <= 0 || u >= 1 || Math.abs(x - r.a.x) >= r.width / 2 + radius)
        continue;
      if (Math.abs(x - r.a.x) > r.width / 2 - radius) return null;
      const entering =
        body.floor === r.a.floor
          ? old <= 0.001 && u < 0.05
          : old >= 0.999 && u > 0.95;
      if (!entering) return null;
      return {
        floor: r.a.floor,
        y: rampHeight(battle.map, r, z),
        rampId: r.id,
        rampDir: body.floor === r.a.floor ? 1 : -1,
      };
    }
    return flat(body.floor);
  }
  function valid(
    battle,
    x,
    z,
    floor,
    body = null,
    { ignoreEntities = false, margin = 0, surface = null } = {},
  ) {
    const level = battle.map.levels[floor];
    if (!level) return false;
    const radius = (body ? TANKS[body.tankType].radius : 3.1) + margin,
      y = surface?.y ?? level.y;
    if (
      Math.abs(x) > level.bound - radius ||
      Math.abs(z) > level.bound - radius
    )
      return false;
    // Flat-floor navigation must go around ramp sides / upper deck openings.
    if (!surface)
      for (const r of battle.map.ramps) {
        if (floor !== r.a.floor && floor !== r.b.floor) continue;
        const u = (z - r.a.z) / (r.b.z - r.a.z);
        if (
          z > Math.min(r.a.z, r.b.z) - margin &&
          z < Math.max(r.a.z, r.b.z) + margin &&
          Math.abs(x - r.a.x) < r.width / 2 + radius
        )
          return false;
      }
    for (const o of battle.map.obstacles) {
      const oy = battle.map.levels[o.floor].y;
      if (y >= oy + o.h || y + 3 <= oy) continue;
      const dx = Math.max(Math.abs(x - o.x) - o.w / 2, 0),
        dz = Math.max(Math.abs(z - o.z) - o.d / 2, 0);
      if (dx * dx + dz * dz < (radius + 0.12) ** 2) return false;
    }
    if (!ignoreEntities)
      for (const other of battle.entities) {
        if (other === body || !other.alive) continue;
        if (
          Math.abs(other.y - y) < 3 &&
          Math.hypot(x - other.x, z - other.z) <
            radius + TANKS[other.tankType].radius + 0.25
        )
          return false;
      }
    return true;
  }
  function collision(battle, a, b, owner = null, { bodies = true } = {}) {
    let closest = null;
    const check = (t, data) => {
      if (t !== null && (!closest || t < closest.t)) closest = { t, ...data };
    };
    for (const o of battle.map.obstacles) {
      const y = battle.map.levels[o.floor].y;
      check(
        slabHit(
          a,
          b,
          { x: o.x - o.w / 2 - 0.12, y: y - 0.1, z: o.z - o.d / 2 - 0.12 },
          { x: o.x + o.w / 2 + 0.12, y: y + o.h, z: o.z + o.d / 2 + 0.12 },
        ),
        { kind: "cover", id: o.id },
      );
    }
    for (const level of battle.map.levels)
      for (const q of deckRects(battle.map, level)) {
        check(
          slabHit(
            a,
            b,
            { x: q.x0, y: level.y - 0.6, z: q.z0 },
            { x: q.x1, y: level.y, z: q.z1 },
          ),
          { kind: "floor", id: level.id },
        );
      }
    for (const r of battle.map.ramps) {
      const transform = (p) => ({
        ...p,
        y: p.y - rampHeight(battle.map, r, p.z),
      });
      check(
        slabHit(
          transform(a),
          transform(b),
          { x: r.a.x - r.width / 2, y: -0.6, z: Math.min(r.a.z, r.b.z) },
          { x: r.a.x + r.width / 2, y: 0, z: Math.max(r.a.z, r.b.z) },
        ),
        { kind: "ramp", id: r.id },
      );
      for (const side of [-1, 1]) {
        const x = r.a.x + side * (r.width / 2 - 0.12);
        check(
          slabHit(
            transform(a),
            transform(b),
            { x: x - 0.12, y: 0, z: Math.min(r.a.z, r.b.z) },
            { x: x + 0.12, y: 0.7, z: Math.max(r.a.z, r.b.z) },
          ),
          { kind: "ramp", id: r.id },
        );
      }
    }
    if (bodies)
      for (const e of battle.entities) {
        if (!e.alive || e.id === owner) continue;
        const r = TANKS[e.tankType].radius * 0.87;
        check(
          slabHit(
            a,
            b,
            { x: e.x - r, y: e.y + 0.15, z: e.z - r },
            {
              x: e.x + r,
              y: e.y + (TANKS[e.tankType].height || 3.0),
              z: e.z + r,
            },
          ),
          { kind: "tank", id: e.id },
        );
      }
    if (closest)
      closest.point = {
        x: a.x + (b.x - a.x) * closest.t,
        y: a.y + (b.y - a.y) * closest.t,
        z: a.z + (b.z - a.z) * closest.t,
      };
    return closest;
  }
  function sight(battle, a, b) {
    if (!b.alive) return false;
    return !battle.collision(
      { x: a.x, y: a.y + 2.2, z: a.z },
      { x: b.x, y: b.y + 1.8, z: b.z },
      a.id,
      { bodies: false },
    );
  }
  function rampOptions(battle, body) {
    return battle.map.ramps
      .flatMap((r) => {
        const from =
          r.a.floor === body.floor
            ? r.a
            : r.b.floor === body.floor
              ? r.b
              : null;
        if (!from) return [];
        const to = from === r.a ? r.b : r.a,
          sign = Math.sign(to.z - from.z);
        return [
          {
            id: r.id,
            from: { ...from, z: from.z - sign * 4 },
            to: { ...to, z: to.z + sign * 4 },
            distance: Math.hypot(body.x - from.x, body.z - from.z),
          },
        ];
      })
      .sort((a, b) => a.distance - b.distance || a.id.localeCompare(b.id));
  }
  return { surface, valid, collision, sight, rampOptions };
});
