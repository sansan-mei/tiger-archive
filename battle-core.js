/* Fixed-tick orchestration and checkpoint lifecycle. Systems are DOM-free. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(
    node ? require("./core/content.js") : root.TankContent,
    node
      ? {
          world: require("./core/world.js"),
          ai: require("./core/ai.js"),
          combat: require("./core/combat.js"),
          movement: require("./core/movement.js"),
          falling: require("./core/falling.js"),
          match: require("./core/match.js"),
          pve: require("./core/pve.js"),
        }
      : root.TankSystems,
  );
  if (node) module.exports = api;
  else root.TankBattle = api;
})(typeof window === "undefined" ? globalThis : window, function (C, Systems) {
  "use strict";
  const {
    VERSION,
    PLUGIN_MANIFEST,
    TICK_RATE,
    MAX_PLAYERS,
    TANKS,
    WEAPONS,
    MAP,
    mapForMode,
    normalizeInput,
    defaultParticipants,
    clone,
  } = C;
  class Battle {
    constructor({
      participants = defaultParticipants(),
      matchId = "local",
      epoch = 1,
      map = null,
      mode = "pvp",
    } = {}) {
      if (
        !Array.isArray(participants) ||
        participants.length < (mode === "pve" ? 1 : 2) ||
        participants.length > MAX_PLAYERS
      )
        throw new Error("A match requires 2–8 participants");
      if (new Set(participants.map((p) => p.id)).size !== participants.length)
        throw new Error("Duplicate player ID");
      if (!["pvp", "pve"].includes(mode)) throw new Error("Invalid game mode");
      this.mode = mode;
      this.map = clone(map || mapForMode(mode));
      this.matchId = matchId;
      this.epoch = epoch;
      this.tick = 0;
      this.status = "ready";
      this.winnerId = null;
      this.nextBullet = 1;
      this.nextEvent = 1;
      this.events = [];
      this.bullets = [];
      this.pickups = (this.map.pickups || []).map((p) => ({
        ...p,
        readyAt: 0,
      }));
      this.entities = participants.map((p, i) => {
        if (mode === "pve") {
          if (p.controller !== "human") throw new Error("PvE participants must be human-controlled");
          p = { ...p, tankType: "human", weaponType: "pistol" };
        }
        if (
          typeof p.id !== "string" ||
          (mode === "pve" && p.id.startsWith("zombie_")) ||
          !/^[a-zA-Z0-9_-]{1,32}$/.test(p.id) ||
          !["human", "bot"].includes(p.controller) ||
          !Object.hasOwn(C.PLAYER_TANKS, p.tankType) ||
          !Object.hasOwn(WEAPONS, p.weaponType)
        )
          throw new Error("Invalid participant");
        const s = this.map.spawns[p.spawn ?? i];
        if (!s) throw new Error("Invalid spawn");
        const spec = TANKS[p.tankType];
        return {
          id: p.id,
          controller: p.controller,
          tankType: p.tankType,
          weaponType: p.weaponType,
          x: s.x,
          y: this.map.levels[s.floor].y,
          z: s.z,
          floor: s.floor,
          heading: -Math.PI / 2,
          aim: -Math.PI / 2,
          pitch: 0,
          hp: spec.hp,
          maxHp: spec.hp,
          shield: spec.shield,
          barrier: 0,
          lastDamageTick: 0,
          abilityCooldown: 0,
          abilityUntil: 0,
          abilityHeld: false,
          alive: true,
          speed: 0,
          ammo: WEAPONS[p.weaponType].magazineSize || 0,
          cooldown: 0,
          charge: 0,
          criticalProgress: 0,
          fireHeld: false,
          needsRelease: false,
          falling: false,
          fallVelocity: 0,
          fallVX: 0,
          fallVZ: 0,
          rampId: null,
          rampDir: 0,
          kills: 0,
          deaths: 0,
          respawnAt: 0,
          protectedUntil: 0,
          boostUntil: 0,
          forfeited: false,
          brain: { target: null, path: [], pathTick: 0, blocked: 0 },
        };
      });
      for (const e of this.entities)
        if (!this.valid(e.x, e.z, e.floor, e))
          throw new Error("Overlapping or obstructed spawn");
      if (mode === "pve") Systems.pve.initialize(this);
    }
    get time() {
      return this.tick / TICK_RATE;
    }
    getEntity(id) {
      return this.entities.find((e) => e.id === id);
    }
    start() {
      if (this.status === "ready" || this.status === "paused")
        this.status = "playing";
    }
    pause() {
      if (this.status === "playing") this.status = "paused";
    }
    emit(type, data = {}) {
      const event = {
        eventId: this.nextEvent++,
        tick: this.tick,
        epoch: this.epoch,
        type,
        ...data,
      };
      this.events.push(event);
      return event;
    }
    surface(...args) {
      return Systems.world.surface(this, ...args);
    }
    valid(...args) {
      return Systems.world.valid(this, ...args);
    }
    collision(...args) {
      return Systems.world.collision(this, ...args);
    }
    sight(...args) {
      return Systems.world.sight(this, ...args);
    }
    rampOptions(...args) {
      return Systems.world.rampOptions(this, ...args);
    }
    route(...args) {
      return Systems.ai.route(this, ...args);
    }
    botInput(...args) {
      return Systems.ai.botInput(this, ...args);
    }
    damage(...args) {
      return Systems.combat.damage(this, ...args);
    }
    resolveHit(...args) {
      return Systems.combat.resolveHit(this, ...args);
    }
    shoot(...args) {
      return Systems.combat.shoot(this, ...args);
    }
    chooseUpgrade(id, wave, choice, offerId) {
      return Systems.pve.choose(this, id, wave, choice, offerId);
    }
    chooseTrial(wave, choice) { return Systems.pve.chooseTrial(this, wave, choice); }
    startNextWave(wave) { return Systems.pve.startNextWave(this, wave); }
    pveDeath(target, owner) {
      Systems.pve.progression.onDeath(this, target, owner, Systems.pve.rewards);
    }
    pveHit(hit, shot, before) { Systems.pve.progression.onHit(this, hit, shot, before); }
    pveModuleDamage(target,shot,amount) { return Systems.pve.progression.moduleDamage(this,target,shot,amount); }
    pveFire(hit, shot) { Systems.pve.progression.fireZone(this, hit, shot); }
    releaseControl(id) {
      const body = this.getEntity(id);
      if (!body) return;
      body.speed = 0;
      body.charge = 0;
      body.fireHeld = false;
      body.abilityHeld = false;
      body.needsRelease = true;
    }
    tickFall(body) {
      return Systems.falling.tickFall(this, body);
    }
    tickEntity(...args) {
      return Systems.movement.tickEntity(this, ...args);
    }
    step(inputs = {}) {
      this.events = [];
      if (this.status !== "playing") return [];
      this.tick++;
      for (const body of this.entities) {
        const raw =
          body.controller === "bot"
            ? this.botInput(body)
            : inputs[body.id] || {};
        this.tickEntity(body, normalizeInput(raw));
      }
      Systems.match.respawnAndPickups(this);
      Systems.match.projectiles(this);
      if (this.mode === "pve") Systems.pve.step(this);
      else Systems.match.finish(this);
      return clone(this.events);
    }
    snapshot() {
      return {
        ...(this.mode === "pve" ? { mode: "pve", pve: clone(this.pve) } : {}),
        version: VERSION,
        pluginManifest: PLUGIN_MANIFEST,
        mapId: this.map.id,
        matchId: this.matchId,
        epoch: this.epoch,
        tick: this.tick,
        status: this.status,
        winnerId: this.winnerId,
        nextBullet: this.nextBullet,
        nextEvent: this.nextEvent,
        pickups: clone(this.pickups),
        entities: clone(this.entities),
        bullets: clone(this.bullets),
      };
    }
    networkSnapshot() {
      return C.projectNetworkState(this.snapshot());
    }
    restore(snapshot) {
      if (snapshot.kind === "network")
        throw new Error("Network state cannot restore authority");
      if (
        snapshot.pluginManifest !== PLUGIN_MANIFEST ||
        snapshot.version !== VERSION ||
        snapshot.mapId !== this.map.id
      )
        throw new Error("Incompatible snapshot");
      for (const k of [
        "matchId",
        "epoch",
        "tick",
        "status",
        "winnerId",
        "nextBullet",
        "nextEvent",
      ])
        this[k] = snapshot[k];
      this.mode = snapshot.mode || "pvp";
      this.pve = snapshot.pve ? clone(snapshot.pve) : undefined;
      this.pickups = clone(snapshot.pickups);
      this.entities = clone(snapshot.entities);
      this.bullets = clone(snapshot.bullets);
      this.events = [];
    }
  }
  return { ...C, PVE: Systems.pve, Battle };
});
