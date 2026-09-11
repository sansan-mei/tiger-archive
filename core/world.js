(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).world = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const { TANKS, slabHit, deckRects, rampHeight, rampCeiling } = C;
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
    if (
      body.floor > 0 &&
      (Math.abs(x) > battle.map.levels[body.floor].bound ||
        Math.abs(z) > battle.map.levels[body.floor].bound)
    )
      return { ...flat(body.floor), falling: true };
    for (const r of battle.map.ramps) {
      if (body.floor !== r.a.floor && body.floor !== r.b.floor) continue;
      const u = (z - r.a.z) / (r.b.z - r.a.z),
        old = (body.z - r.a.z) / (r.b.z - r.a.z);
      if (u <= 0 || u >= 1 || Math.abs(x - r.a.x) >= r.width / 2 + radius)
        continue;
      if (
        body.floor === r.a.floor &&
        rampCeiling(battle.map, r, x, z, radius) >=
          body.y + (TANKS[body.tankType].height || 3) + 0.1
      )
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
    {
      ignoreEntities = false,
      ignoreAllies = false,
      margin = 0,
      surface = null,
      allowDrop = false,
    } = {},
  ) {
    const level = battle.map.levels[floor];
    if (!level) return false;
    const radius = (body ? TANKS[body.tankType].radius : 3.1) + margin,
      y = surface?.y ?? level.y;
    // Driving may overhang an upper deck until its center loses support.
    // Navigation still keeps a full footprint away from the edge.
    const bound = (allowDrop && floor > 0 ? battle.map.levels[0] : level).bound;
    if (
      Math.abs(x) > bound - radius ||
      Math.abs(z) > bound - radius
    )
      return false;
    // Navigation and actual movement share the same clearance check.
    // Only an explicit ramp surface can climb; passing underneath remains flat.
    for (const r of battle.map.ramps) {
      if (surface?.rampId === r.id) continue;
      if (floor !== r.a.floor && floor !== r.b.floor) continue;
      const lo = Math.min(r.a.z, r.b.z),
        hi = Math.max(r.a.z, r.b.z);
      const checkZ =
        margin && z > lo - margin && z < hi + margin
          ? Math.max(lo + 1e-6, Math.min(hi - 1e-6, z))
          : z;
      const ceiling = rampCeiling(battle.map, r, x, checkZ, radius);
      if (ceiling === Infinity) continue;
      if (
        floor === r.b.floor ||
        ceiling < y + (body ? TANKS[body.tankType].height || 3 : 3) + 0.1
      )
        return false;
    }
    for (const r of battle.map.ramps) {
      if (surface?.rampId === r.id || floor !== r.a.floor) continue;
      // The low toe is already impassable through rampCeiling; keep its climb-in
      // endpoint open. Only the new high abutment adds a movement footprint.
      for (const support of C.rampSupports(battle.map,r).slice(1)) {
        const dx=Math.max(Math.abs(x-r.a.x)-r.width/2,0);
        const dz=Math.max(support.z0-z,z-support.z1,0);
        if (dx*dx+dz*dz<(radius+.12)**2) return false;
      }
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
        if (
          other === body ||
          !other.alive ||
          (ignoreAllies &&
            body?.tankType === "zombie" &&
            other.tankType === "zombie")
        )
          continue;
        if (
          Math.abs(other.y - y) < 3 &&
          Math.hypot(x - other.x, z - other.z) <
            radius + TANKS[other.tankType].radius + 0.25
        )
          return false;
      }
    return true;
  }
  function collision(
    battle,
    a,
    b,
    owner = null,
    { bodies = true, radius = 0, ignoreIds = [] } = {},
  ) {
    // Swept beam: expand solid obstacles and bodies equally, so the wider beam cannot cut through cover.
    const sweep = (start, end, min, max, verticalRadius = radius) =>
      slabHit(
        start,
        end,
        { x: min.x - radius, y: min.y - verticalRadius, z: min.z - radius },
        { x: max.x + radius, y: max.y + verticalRadius, z: max.z + radius },
      );
    let closest = null;
    const check = (t, data) => {
      if (t !== null && (!closest || t < closest.t)) closest = { t, ...data };
    };
    for (const o of battle.map.obstacles) {
      const y = battle.map.levels[o.floor].y;
      check(
        sweep(
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
          sweep(
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
        sweep(
          transform(a),
          transform(b),
          { x: r.a.x - r.width / 2, y: -0.6, z: Math.min(r.a.z, r.b.z) },
          { x: r.a.x + r.width / 2, y: 0, z: Math.max(r.a.z, r.b.z) },
          radius *
            Math.hypot(
              1,
              (battle.map.levels[r.b.floor].y -
                battle.map.levels[r.a.floor].y) /
                (r.b.z - r.a.z),
            ),
        ),
        { kind: "ramp", id: r.id },
      );
      for (const support of C.rampSupports(battle.map,r)) {
        // Clip the ray to the support footprint/ground first, then its sloping roof.
        const base=battle.map.levels[r.a.floor].y;
        const t=sweep(a,b,{x:r.a.x-r.width/2,y:base,z:support.z0},
          {x:r.a.x+r.width/2,y:battle.map.levels[r.b.floor].y,z:support.z1});
        if(t!==null) {
          const reverse=sweep(b,a,{x:r.a.x-r.width/2,y:base,z:support.z0},
            {x:r.a.x+r.width/2,y:battle.map.levels[r.b.floor].y,z:support.z1});
          const endT=1-reverse;
          const at=u=>({x:a.x+(b.x-a.x)*u,y:a.y+(b.y-a.y)*u,z:a.z+(b.z-a.z)*u});
          const roof=sweep(transform(at(t)),transform(at(endT)),
            {x:r.a.x-r.width/2,y:base-battle.map.levels[r.b.floor].y,z:support.z0},
            {x:r.a.x+r.width/2,y:-.6,z:support.z1});
          if(roof!==null) check(t+(endT-t)*roof,{kind:'ramp',id:r.id});
        }
      }
      for (const side of [-1, 1]) {
        const x = r.a.x + side * (r.width / 2 - 0.12);
        check(
          sweep(
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
        if (!e.alive || e.id === owner || ignoreIds.includes(e.id)) continue;
        if (battle.mode === "pve" && e.tankType !== "zombie" &&
            battle.entities.some((v) => v.id === owner && v.tankType !== "zombie")) continue;
        const r = TANKS[e.tankType].radius * 0.87;
        check(
          sweep(
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
