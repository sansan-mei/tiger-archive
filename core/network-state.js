/* Public state projection. Checkpoints retain AI state and the full content manifest. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TankNetworkState = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const entityFields = Object.freeze([
    "id",
    "controller",
    "tankType",
    "weaponType",
    "x",
    "y",
    "z",
    "floor",
    "heading",
    "aim",
    "pitch",
    "hp",
    "maxHp",
    "shield",
    "barrier",
    "lastDamageTick",
    "abilityCooldown",
    "abilityUntil",
    "abilityHeld",
    "alive",
    "speed",
    "cooldown",
    "charge",
    "fireHeld",
    "needsRelease",
    "rampId",
    "rampDir",
    "kills",
    "deaths",
    "respawnAt",
    "protectedUntil",
    "boostUntil",
    "forfeited",
  ]);
  function project(snapshot) {
    const {
      version,
      mapId,
      matchId,
      epoch,
      tick,
      status,
      winnerId,
      nextBullet,
      nextEvent,
      pickups,
      bullets,
    } = snapshot;
    const entities = snapshot.entities.map((entity) =>
      Object.fromEntries(entityFields.map((key) => [key, entity[key]])),
    );
    return {
      kind: "network",
      version,
      mapId,
      matchId,
      epoch,
      tick,
      status,
      winnerId,
      nextBullet,
      nextEvent,
      pickups,
      bullets,
      entities,
    };
  }
  return Object.freeze({ entityFields, project });
});
