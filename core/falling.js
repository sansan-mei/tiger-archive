/* Server-authoritative descent from unsupported upper deck edges. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).falling = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  function tickFall(battle, body) {
    const radius = C.TANKS[body.tankType].radius;
    const bound = battle.map.levels[0].bound - radius;
    let x = C.clamp(body.x + body.fallVX * C.DT, -bound, bound);
    let z = C.clamp(body.z + body.fallVZ * C.DT, -bound, bound);
    if (Math.abs(x) === bound) body.fallVX = 0;
    if (Math.abs(z) === bound) body.fallVZ = 0;
    body.fallVelocity = Math.max(
      -C.RULES.terminalFallSpeed,
      body.fallVelocity - C.RULES.gravity * C.DT,
    );
    const y = body.y + body.fallVelocity * C.DT;
    // Find the first deck crossed, not a fixed number of floors to teleport down.
    const landing = battle.map.levels
      .filter(
        (level) =>
          level.y <= body.y &&
          level.y >= y &&
          C.deckRects(battle.map, level).some(
            (q) => x >= q.x0 && x <= q.x1 && z >= q.z0 && z <= q.z1,
          ),
      )
      .sort((a, b) => b.y - a.y)[0];
    if (landing) {
      // Resolve an occupied landing deterministically, staying on actual deck support.
      let spot = null;
      for (let ring = 0; ring <= 4 && !spot; ring++)
        for (let i = 0; i < (ring ? 16 : 1); i++) {
          const px = x + Math.cos((i * Math.PI) / 8) * ring * (radius + 1);
          const pz = z + Math.sin((i * Math.PI) / 8) * ring * (radius + 1);
          if (
            C.deckRects(battle.map, landing).some(
              (q) => px >= q.x0 && px <= q.x1 && pz >= q.z0 && pz <= q.z1,
            ) &&
            battle.valid(px, pz, landing.id, body, { allowDrop: true })
          ) {
            spot = { x: px, z: pz };
            break;
          }
        }
      if (!spot) {
        body.y = landing.y + 0.01;
        body.fallVelocity = body.fallVX = body.fallVZ = 0;
        return;
      }
      Object.assign(body, spot, {
        y: landing.y,
        floor: landing.id,
        falling: false,
        fallVelocity: 0,
        fallVX: 0,
        fallVZ: 0,
      });
      body.speed *= 0.35;
      body.brain.path = [];
      body.brain.pathTick = 0;
      battle.emit("land", { id: body.id, x: body.x, y: body.y, z: body.z });
      return;
    }
    Object.assign(body, { x, z, y });
  }
  return { tickFall };
});
