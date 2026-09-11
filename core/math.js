(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TankMath = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  const wrap = (a) =>
    ((((a + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2)) - Math.PI;
  const turn = (a, b, s) => wrap(a + clamp(wrap(b - a), -s, s));
  const finite = (n) => typeof n === "number" && Number.isFinite(n);
  // The same deck rectangles are used by projectile collision and rendering.
  function deckRects(map, level) {
    let rects = [
      { x0: -level.bound, x1: level.bound, z0: -level.bound, z1: level.bound },
    ];
    for (const r of map.ramps.filter((r) => r.b.floor === level.id)) {
      const hole = {
        x0: r.a.x - r.width / 2,
        x1: r.a.x + r.width / 2,
        z0: Math.min(r.a.z, r.b.z),
        z1: Math.max(r.a.z, r.b.z),
      };
      rects = rects.flatMap((q) => {
        const x0 = Math.max(q.x0, hole.x0),
          x1 = Math.min(q.x1, hole.x1),
          z0 = Math.max(q.z0, hole.z0),
          z1 = Math.min(q.z1, hole.z1);
        if (x0 >= x1 || z0 >= z1) return [q];
        return [
          { ...q, x1: x0 },
          { ...q, x0: x1 },
          { x0, x1, z0: q.z0, z1: z0 },
          { x0, x1, z0: z1, z1: q.z1 },
        ].filter((v) => v.x1 > v.x0 && v.z1 > v.z0);
      });
    }
    return rects;
  }
  function rampHeight(map, r, z) {
    return (
      map.levels[r.a.floor].y +
      ((z - r.a.z) / (r.b.z - r.a.z)) *
        (map.levels[r.b.floor].y - map.levels[r.a.floor].y)
    );
  }
  // Grounded ends leave a crosswise culvert through the high middle of each ramp.
  function rampSupports(map, r) {
    const rise = map.levels[r.b.floor].y - map.levels[r.a.floor].y;
    return [[.6 / rise, .3], [.96, 1]].map(([u0,u1]) => {
      const a = r.a.z + (r.b.z-r.a.z)*u0, b = r.a.z + (r.b.z-r.a.z)*u1;
      return {z0: Math.min(a,b), z1: Math.max(a,b)};
    });
  }
  function slabHit(a, b, min, max) {
    let lo = 0,
      hi = 1;
    for (const axis of ["x", "y", "z"]) {
      const d = b[axis] - a[axis];
      if (Math.abs(d) < 1e-10) {
        if (a[axis] < min[axis] || a[axis] > max[axis]) return null;
        continue;
      }
      let t0 = (min[axis] - a[axis]) / d,
        t1 = (max[axis] - a[axis]) / d;
      if (t0 > t1) [t0, t1] = [t1, t0];
      lo = Math.max(lo, t0);
      hi = Math.min(hi, t1);
      if (lo > hi) return null;
    }
    return lo;
  }
  // Lowest underside across the unit footprint; thickness is measured vertically.
  function rampCeiling(map, ramp, x, z, radius = 0) {
    const lo = Math.min(ramp.a.z, ramp.b.z),
      hi = Math.max(ramp.a.z, ramp.b.z);
    if (z <= lo || z >= hi || Math.abs(x - ramp.a.x) >= ramp.width / 2 + radius)
      return Infinity;
    return (
      Math.min(
        rampHeight(map, ramp, Math.max(lo, z - radius)),
        rampHeight(map, ramp, Math.min(hi, z + radius)),
      ) - 0.6
    );
  }
  function dropExit(map, floor, x, z, radius) {
    const level = map.levels[floor];
    return (map.dropExits || []).find(
      (exit) =>
        exit.floor === floor &&
        Math.abs(x - exit.x) <= exit.width / 2 - radius &&
        z * exit.side > level.bound - radius,
    );
  }
  function boxHit(a, b, o, pad = 0) {
    return slabHit(
      { x: a.x, y: 0, z: a.z },
      { x: b.x, y: 0, z: b.z },
      { x: o.x - o.w / 2 - pad, y: -1, z: o.z - o.d / 2 - pad },
      { x: o.x + o.w / 2 + pad, y: 1, z: o.z + o.d / 2 + pad },
    );
  }
  return {
    clone,
    clamp,
    wrap,
    turn,
    finite,
    deckRects,
    rampHeight,
    rampSupports,
    rampCeiling,
    dropExit,
    slabHit,
    boxHit,
  };
});
