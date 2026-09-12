/* Client-side aim assistance only; the server still limits turret speed and resolves hits. */
(window.TankClient ??= {}).createAimAssist = function () {
  let lockedId = null,
    revision = null,
    acquireAt = 0;
  function reset(time) {
    lockedId = null;
    acquireAt = time + 180;
  }
  function update({
    time,
    inputRevision,
    enabled,
    player,
    entities,
    hitId,
    project,
    visible,
    range,
  }) {
    if (revision !== inputRevision) {
      revision = inputRevision;
      reset(time);
    }
    if (!enabled) {
      reset(time);
      return null;
    }
    const candidate = (entity, screenLimit = 96) => {
      if (!entity || !entity.alive || entity.id === player.id) return null;
      const point = {
        x: entity.x,
        y: entity.y + (entity.height || 3) * 0.6,
        z: entity.z,
      };
      if (
        Math.hypot(point.x - player.x, point.y - player.y, point.z - player.z) >
        range
      )
        return null;
      const screen = project(point);
      if (!screen.visible || screen.distance > screenLimit || !visible(entity, point))
        return null;
      return { id: entity.id, point, screen };
    };
    if (lockedId) {
      const target = candidate(entities.find((e) => e.id === lockedId), 96);
      if (target) return target;
      reset(time);
      return null;
    }
    if (time < acquireAt) return null;
    const candidates = entities
      .map((entity) => candidate(entity, entity.id === hitId ? 64 : 16))
      .filter(Boolean);
    candidates.sort(
      (a, b) =>
        Number(b.id === hitId) - Number(a.id === hitId) ||
        a.screen.distance - b.screen.distance ||
        a.id.localeCompare(b.id),
    );
    const target = candidates[0];
    if (target) lockedId = target.id;
    return target || null;
  }
  return { update };
};
