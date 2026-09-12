(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("../plugins/catalog.js") : root.TankPlugins,
    node ? require("./abilities.js") : root.TankAbilities,
    node ? require("./network-state.js") : root.TankNetworkState,
    node ? require("./map.js") : root.TankMap,
    node ? require("./math.js") : root.TankMath,
  );
  if (node) module.exports = api;
  else root.TankContent = api;
})(
  typeof window === "undefined" ? globalThis : window,
  function (Plugins, Abilities, NetworkState, MAP, Maths) {
    const {
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
    } = Maths;
    ("use strict");
    const ABILITIES = Abilities.definitions;
    const VERSION = 26,
      TICK_RATE = 60,
      DT = 1 / TICK_RATE,
      MAX_PLAYERS = 8;
    const RULES = Object.freeze({
      edgeFall: "all-outer-edges-v1",
      gravity: 20,
      terminalFallSpeed: 30,
      duration: 28800,
      pveDuration: 57600,
      killLimit: 15,
      respawn: 240,
      protection: 120,
      boost: 360,
      pickupCooldown: 1200,
      repair: 40,
      pveHealthPerPlayer: 0.25,
      pveHealthPerWave: 0.05,
    });
    const PLUGIN_MANIFEST = JSON.stringify({
      plugins: Plugins.seal(),
      abilities: ABILITIES,
      rules: RULES,
    });
    const TANKS = Object.freeze(
      Object.fromEntries(
        Object.entries(Plugins.tanks).map(([id, p]) => [id, p.spec]),
      ),
    );
    const ZOMBIE_SPECS = Object.freeze(Object.fromEntries(
      Object.entries(TANKS.zombie.variants).map(([id, variant]) => [id, Object.freeze({ ...TANKS.zombie, ...variant })]),
    ));
    const unitSpec = (body) => body.tankType === "zombie"
      ? ZOMBIE_SPECS[body.zombieType || "walker"] : TANKS[body.tankType];
    const PLAYER_TANKS = Object.freeze(Object.fromEntries(Object.entries(TANKS).filter(([, spec]) => !spec.enemyOnly)));
    const PVE_MAP = Object.freeze({
      ...MAP,
      id: MAP.id + "-pve-ground-v1",
      levels: Object.freeze(MAP.levels.slice(0, 1).map((level) => Object.freeze({ ...level }))),
      obstacles: Object.freeze(MAP.obstacles.filter((item) => item.floor === 0).map((item) => Object.freeze({ ...item }))),
      ramps: Object.freeze([]),
      dropExits: Object.freeze([]),
      pickups: Object.freeze(MAP.pickups.filter((item) => item.floor === 0).map((item) => Object.freeze({ ...item }))),
      spawns: Object.freeze(MAP.spawns.map(({ x, z }) => Object.freeze({ x, z, floor: 0 }))),
    });
    const mapForMode = (mode) => mode === "pve" ? PVE_MAP : MAP;
    const WEAPONS = Object.freeze(
      Object.fromEntries(
        Object.entries(Plugins.weapons).map(([id, p]) => [id, p.spec]),
      ),
    );
    function normalizeInput(raw = {}) {
      if (!raw || typeof raw !== "object" || Array.isArray(raw))
        throw new Error("Invalid input");
      const allowed = [
        "forward",
        "reverse",
        "left",
        "right",
        "brake",
        "fire",
        "interact",
        "aimLeft",
        "aimRight",
        "cancelFire",
        "aimYaw",
        "aimPitch",
        "ability",
        "moveYaw",
      ];
      if (Object.keys(raw).some((k) => !allowed.includes(k)))
        throw new Error("Unknown input field");
      const input = {};
      for (const key of allowed.filter(
        (k) => !["aimYaw", "aimPitch", "moveYaw"].includes(k),
      )) {
        if (raw[key] !== undefined && typeof raw[key] !== "boolean")
          throw new Error("Invalid input flag");
        input[key] = raw[key] === true;
      }
      if (raw.aimYaw !== undefined) {
        if (!finite(raw.aimYaw) || Math.abs(raw.aimYaw) > Math.PI * 8)
          throw new Error("Invalid aim yaw");
        input.aimYaw = wrap(raw.aimYaw);
      }
      if (raw.aimPitch !== undefined) {
        if (!finite(raw.aimPitch) || Math.abs(raw.aimPitch) > 0.65)
          throw new Error("Invalid aim pitch");
        input.aimPitch = clamp(raw.aimPitch, -0.55, 0.55);
      }
      if (raw.moveYaw !== undefined) {
        if (!finite(raw.moveYaw) || Math.abs(raw.moveYaw) > Math.PI * 8)
          throw new Error("Invalid move yaw");
        input.moveYaw = wrap(raw.moveYaw);
      }
      return input;
    }
    function defaultParticipants(
      loadout = { tankType: "medium", weaponType: "standard" },
    ) {
      return MAP.spawns.map((spawn, i) => ({
        id: i ? "bot" + i : "p1",
        controller: i ? "bot" : "human",
        tankType: i
          ? ["light", "medium", "heavy", "human"][i % 4]
          : loadout.tankType,
        weaponType: i
          ? ["rapid", "standard", "laser", "rocket"][i % 4]
          : loadout.weaponType,
        spawn: i,
      }));
    }
    return {
      projectNetworkState: NetworkState.project,
      ABILITIES,
      describeAbility: Abilities.describe,
      RULES,
      VERSION,
      PLUGIN_MANIFEST,
      TICK_RATE,
      DT,
      MAX_PLAYERS,
      TANKS,
      PLAYER_TANKS,
      ZOMBIE_SPECS,
      unitSpec,
      WEAPONS,
      MAP,
      PVE_MAP,
      mapForMode,
      normalizeInput,
      defaultParticipants,
      wrap,
      turn,
      boxHit,
      slabHit,
      clone,
      deckRects,
      rampHeight,
      rampSupports,
      rampCeiling,
      dropExit,
      clamp,
    };
  },
);
