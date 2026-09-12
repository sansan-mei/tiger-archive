/* Owns orbit state and camera collision, independent of DOM controls. */
(window.TankClient ??= {}).createCameraRig = function ({
  T,
  C,
  camera,
  reduced,
  getPlayerId,
  getMode = () => "pvp",
}) {
  const state = {
    viewYaw: null,
    viewPitch: 0.2,
    lastPointer: null,
    cameraHeading: 0,
    cameraElevation: 0.2,
    zoom: 12,
    look: new T.Vector3(0, 1, 52),
  };
  function updateChaseCamera(body, dt, snap = false) {
    if (snap) {
      state.viewYaw = null;
      state.viewPitch = 0.2;
      state.lastPointer = null;
      state.cameraHeading = body.heading;
      state.cameraElevation = 0.2;
    }
    const map = C.mapForMode(getMode()), heading =
      body.id === getPlayerId()
        ? (state.viewYaw ?? body.heading)
        : body.heading;
    const distance = state.zoom * (window.innerWidth < 700 ? 1.1 : 1),
      ease = snap || reduced ? 1 : 1 - Math.exp(-dt * 8);
    state.cameraHeading = C.turn(
      state.cameraHeading,
      heading,
      Math.abs(C.wrap(heading - state.cameraHeading)) * ease,
    );
    state.cameraElevation += (state.viewPitch - state.cameraElevation) * ease;
    const forward = new T.Vector3(
      -Math.cos(state.cameraHeading),
      0,
      Math.sin(state.cameraHeading),
    );
    let pivotHeight = 3.2;
    if (!body.rampId)
      for (const r of map.ramps) {
        if (r.a.floor !== body.floor) continue;
        const ceiling = C.rampCeiling(map, r, body.x, body.z);
        pivotHeight = Math.min(pivotHeight, ceiling - body.y - 0.25);
      }
    // A spherical orbit: pitch changes camera height and horizontal radius around one pivot.
    state.look.lerp(new T.Vector3(body.x, body.y + pivotHeight, body.z), ease);
    const horizontal = distance * Math.cos(state.cameraElevation);
    camera.position.set(
      state.look.x - forward.x * horizontal,
      state.look.y + distance * Math.sin(state.cameraElevation),
      state.look.z - forward.z * horizontal,
    );
    // Pull the camera in when a wall lies behind the vehicle, rather than looking through it.
    const anchor = { x: body.x, y: body.y + pivotHeight, z: body.z };
    let fraction = 1;
    const floor = body.rampId
      ? map.ramps.find((r) => r.id === body.rampId).b.floor
      : body.floor;
    for (const o of map.obstacles) {
      if (o.floor > floor) continue;
      const y = map.levels[o.floor].y;
      const hit = C.slabHit(
        anchor,
        camera.position,
        { x: o.x - o.w / 2 - 0.4, y: y - 0.4, z: o.z - o.d / 2 - 0.4 },
        { x: o.x + o.w / 2 + 0.4, y: y + o.h + 0.4, z: o.z + o.d / 2 + 0.4 },
      );
      if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - 0.04));
    }
    for (const level of map.levels) {
      for (const q of C.deckRects(map, level)) {
        const hit = C.slabHit(
          anchor,
          camera.position,
          { x: q.x0, y: level.y - 0.8, z: q.z0 },
          { x: q.x1, y: level.y + 0.2, z: q.z1 },
        );
        if (hit !== null)
          fraction = Math.min(fraction, Math.max(0, hit - 0.04));
      }
    }
    for (const r of map.ramps) {
      const transform = (p) => ({
        x: p.x,
        y: p.y - C.rampHeight(map, r, p.z),
        z: p.z,
      });
      const hit = C.slabHit(
        transform(anchor),
        transform(camera.position),
        { x: r.a.x - r.width / 2, y: -0.8, z: Math.min(r.a.z, r.b.z) },
        { x: r.a.x + r.width / 2, y: 0.2, z: Math.max(r.a.z, r.b.z) },
      );
      if (hit !== null) fraction = Math.min(fraction, Math.max(0, hit - 0.04));
    }
    if (fraction < 1)
      camera.position.set(
        anchor.x + (camera.position.x - anchor.x) * fraction,
        anchor.y + (camera.position.y - anchor.y) * fraction,
        anchor.z + (camera.position.z - anchor.z) * fraction,
      );
    camera.lookAt(state.look);
  }
  return Object.assign(state, { update: updateChaseCamera });
};
