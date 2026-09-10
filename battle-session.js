/* Transport-independent authority and replica. No sockets or WebRTC are opened here. */
(function (root, factory) {
  const core =
    typeof module === "object" && module.exports
      ? require("./battle-core.js")
      : root.TankBattle;
  const api = factory(core);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TankSession = api;
})(typeof window === "undefined" ? globalThis : window, function (C) {
  "use strict";
  const VERSION = C.VERSION,
    MAX_BYTES = 65536,
    INPUT_TIMEOUT = 18;
  const plain = (o) =>
    o !== null &&
    typeof o === "object" &&
    !Array.isArray(o) &&
    (Object.getPrototypeOf(o) === Object.prototype ||
      Object.getPrototypeOf(o) === null);
  const integer = (x, a = 0, b = Number.MAX_SAFE_INTEGER) =>
    Number.isSafeInteger(x) && x >= a && x <= b;
  const number = (x, a, b) =>
    typeof x === "number" && Number.isFinite(x) && x >= a && x <= b;
  const id = (s) => typeof s === "string" && /^[a-zA-Z0-9_-]{1,48}$/.test(s);
  function decode(raw) {
    if (typeof raw === "string") {
      if (new TextEncoder().encode(raw).byteLength > MAX_BYTES)
        throw new Error("Packet too large");
      raw = JSON.parse(raw);
    }
    if (!plain(raw)) throw new Error("Invalid packet");
    const encoded = JSON.stringify(raw);
    if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES)
      throw new Error("Packet too large");
    return JSON.parse(encoded);
  }
  function validateSnapshot(s, { network = false } = {}) {
    if (
      !plain(s) ||
      (!network && s.pluginManifest !== C.PLUGIN_MANIFEST) ||
      (network && s.kind !== "network") ||
      s.version !== VERSION ||
      s.mapId !== C.MAP.id ||
      !id(s.matchId) ||
      !integer(s.epoch, 1) ||
      !integer(s.tick) ||
      !integer(s.nextBullet, 1) ||
      !integer(s.nextEvent, 1) ||
      !["ready", "playing", "paused", "finished"].includes(s.status)
    )
      throw new Error("Invalid snapshot header");
    if (
      !Array.isArray(s.entities) ||
      s.entities.length < 2 ||
      s.entities.length > C.MAX_PLAYERS ||
      new Set(s.entities.map((e) => e.id)).size !== s.entities.length
    )
      throw new Error("Invalid entities");
    for (const e of s.entities) {
      if (
        !plain(e) ||
        !id(e.id) ||
        !["human", "bot"].includes(e.controller) ||
        !Object.hasOwn(C.TANKS, e.tankType) ||
        !Object.hasOwn(C.WEAPONS, e.weaponType)
      )
        throw new Error("Invalid entity identity");
      const tank = C.TANKS[e.tankType],
        weapon = C.WEAPONS[e.weaponType];
      if (
        !number(e.x, -80, 80) ||
        !number(e.z, -80, 80) ||
        !number(e.y, 0, 20) ||
        !integer(e.floor, 0, 2) ||
        !number(e.hp, 0, tank.hp) ||
        e.maxHp !== tank.hp ||
        typeof e.alive !== "boolean" ||
        e.alive !== e.hp > 0 ||
        !number(
          e.speed,
          C.ABILITIES[tank.ability].allowReverse
            ? -C.ABILITIES[tank.ability].burstSpeed
            : -tank.reverse,
          Math.max(C.ABILITIES[tank.ability].burstSpeed, tank.speed * 1.35),
        ) ||
        !number(e.shield, 0, tank.shield) ||
        !number(e.barrier, 0, C.ABILITIES[tank.ability].barrier) ||
        !integer(e.lastDamageTick) ||
        !integer(e.abilityCooldown, 0, tank.abilityCooldown) ||
        !integer(e.abilityUntil) ||
        typeof e.abilityHeld !== "boolean" ||
        !number(e.heading, -Math.PI, Math.PI) ||
        !number(e.aim, -Math.PI, Math.PI) ||
        !number(e.pitch, -0.55, 0.55) ||
        !integer(e.cooldown, 0, weapon.cooldown) ||
        !integer(e.charge, 0, weapon.charge) ||
        !integer(e.kills, 0, 1000) ||
        !integer(e.deaths, 0, 1000) ||
        ![e.respawnAt, e.protectedUntil, e.boostUntil].every((v) =>
          integer(v),
        ) ||
        typeof e.forfeited !== "boolean"
      )
        throw new Error("Invalid entity state");
      const fallLimit = Math.max(
        C.ABILITIES[tank.ability].burstSpeed,
        tank.speed * 1.35,
        tank.reverse,
      );
      if (
        typeof e.falling !== "boolean" ||
        !number(e.fallVelocity, -C.RULES.terminalFallSpeed, 0) ||
        !number(e.fallVX, -fallLimit, fallLimit) ||
        !number(e.fallVZ, -fallLimit, fallLimit) ||
        Math.hypot(e.fallVX, e.fallVZ) > fallLimit + 1e-6
      )
        throw new Error("Invalid falling state");
      if (e.falling) {
        if (
          e.rampId !== null ||
          e.rampDir !== 0 ||
          e.floor === 0 ||
          e.y > C.MAP.levels[e.floor].y ||
          Math.abs(e.x) > C.MAP.levels[0].bound - tank.radius + 1e-6 ||
          Math.abs(e.z) > C.MAP.levels[0].bound - tank.radius + 1e-6
        )
          throw new Error("Invalid falling position");
      } else if (e.fallVelocity !== 0 || e.fallVX !== 0 || e.fallVZ !== 0)
        throw new Error("Unexpected airborne velocity");
      if (e.rampId !== null) {
        const r = C.MAP.ramps.find((r) => r.id === e.rampId);
        if (
          !r ||
          e.floor !== r.a.floor ||
          ![1, -1].includes(e.rampDir) ||
          Math.abs(e.x - r.a.x) > r.width / 2 - tank.radius + 0.001 ||
          e.z <= Math.min(r.a.z, r.b.z) ||
          e.z >= Math.max(r.a.z, r.b.z) ||
          Math.abs(e.y - C.rampHeight(C.MAP, r, e.z)) > 0.00001
        )
          throw new Error("Invalid ramp state");
      } else if (
        !e.falling &&
        (e.y !== C.MAP.levels[e.floor].y || e.rampDir !== 0)
      )
        throw new Error("Invalid floor height");
      if (e.rampId === null && !e.falling)
        for (const ramp of C.MAP.ramps) {
          if (
            e.floor === ramp.a.floor &&
            C.rampCeiling(C.MAP, ramp, e.x, e.z, tank.radius) <
              e.y + (tank.height || 3) + 0.1 - 1e-6
          )
            throw new Error("Insufficient ramp clearance");
        }
      if (
        !network &&
        (!plain(e.brain) ||
          !Array.isArray(e.brain.path) ||
          e.brain.path.length > 1100 ||
          !e.brain.path.every(
            (p) => plain(p) && number(p.x, -64, 64) && number(p.z, -64, 64),
          ))
      )
        throw new Error("Invalid path");
    }
    if (
      !Array.isArray(s.pickups) ||
      s.pickups.length !== C.MAP.pickups.length ||
      s.pickups.some(
        (p, i) =>
          !plain(p) ||
          !integer(p.readyAt) ||
          ["id", "kind", "floor", "x", "z"].some(
            (k) => p[k] !== C.MAP.pickups[i][k],
          ),
      )
    )
      throw new Error("Invalid pickups");
    const owners = new Set(s.entities.map((e) => e.id));
    if (s.winnerId !== null && !owners.has(s.winnerId))
      throw new Error("Invalid winner");
    if (
      !Array.isArray(s.bullets) ||
      s.bullets.length > 512 ||
      new Set(s.bullets.map((b) => b.id)).size !== s.bullets.length
    )
      throw new Error("Invalid projectiles");
    for (const b of s.bullets)
      if (
        !plain(b) ||
        !integer(b.id, 1) ||
        !owners.has(b.owner) ||
        !Object.hasOwn(C.WEAPONS, b.weaponType) ||
        !number(b.x, -80, 80) ||
        !number(b.z, -80, 80) ||
        !number(b.y, -2, 50) ||
        !number(b.dx, -1, 1) ||
        !number(b.dy, -1, 1) ||
        !number(b.dz, -1, 1) ||
        !integer(b.life, 0, C.WEAPONS[b.weaponType].life) ||
        !integer(b.damage, 1, C.WEAPONS[b.weaponType].damage)
      )
        throw new Error("Invalid projectile");
    return s;
  }
  class Authority {
    constructor(options = {}) {
      this.battle = new C.Battle(options);
      this.peers = new Map();
      this.commands = new Map();
      this.history = [];
      this.packetSequence = 0;
      this.connectionSequence = 0;
    }
    attach(peerId, entityId) {
      if (!id(peerId)) throw new Error("Invalid peer");
      const entity = this.battle.getEntity(entityId);
      if (
        !entity ||
        entity.controller !== "human" ||
        [...this.peers].some(
          ([p, v]) => p !== peerId && v.entityId === entityId,
        )
      )
        throw new Error("Entity unavailable");
      const connection = ++this.connectionSequence;
      this.commands.delete(entityId);
      this.peers.set(peerId, {
        entityId,
        connection,
        seq: -1,
        lastTick: -1000,
      });
      return {
        version: VERSION,
        type: "welcome",
        pluginManifest: C.PLUGIN_MANIFEST,
        matchId: this.battle.matchId,
        epoch: this.battle.epoch,
        entityId,
        connection,
        tickRate: C.TICK_RATE,
      };
    }
    detach(peerId) {
      const peer = this.peers.get(peerId);
      if (peer) {
        this.commands.delete(peer.entityId);
        this.battle.releaseControl(peer.entityId);
      }
      this.peers.delete(peerId);
    }
    receive(peerId, raw) {
      const peer = this.peers.get(peerId);
      if (!peer) return { ok: false, reason: "unknown-peer" };
      let message, input;
      try {
        message = decode(raw);
        if (
          Object.keys(message).some(
            (k) =>
              ![
                "version",
                "type",
                "matchId",
                "epoch",
                "seq",
                "clientTick",
                "connection",
                "input",
              ].includes(k),
          )
        )
          throw new Error("Unexpected field");
        if (
          message.version !== VERSION ||
          message.type !== "input" ||
          message.matchId !== this.battle.matchId ||
          message.epoch !== this.battle.epoch
        )
          throw new Error("Wrong match");
        if (message.connection !== peer.connection)
          throw new Error("Old connection");
        if (!integer(message.seq) || message.seq <= peer.seq)
          throw new Error("Old sequence");
        if (
          !integer(
            message.clientTick,
            Math.max(0, this.battle.tick - 120),
            this.battle.tick + 6,
          )
        )
          throw new Error("Invalid input tick");
        input = C.normalizeInput(message.input);
      } catch (error) {
        return { ok: false, reason: error.message };
      }
      peer.seq = message.seq;
      peer.lastTick = this.battle.tick;
      this.commands.set(peer.entityId, input);
      return { ok: true, ack: peer.seq };
    }
    step() {
      const inputs = Object.create(null);
      for (const peer of this.peers.values())
        inputs[peer.entityId] =
          this.battle.tick - peer.lastTick < INPUT_TIMEOUT
            ? this.commands.get(peer.entityId) || {}
            : { cancelFire: true };
      const events = this.battle.step(inputs);
      this.history.push(...events);
      if (this.history.length > 256)
        this.history.splice(0, this.history.length - 256);
      return events;
    }
    statePacket({ network = false } = {}) {
      return {
        version: VERSION,
        type: "state",
        matchId: this.battle.matchId,
        epoch: this.battle.epoch,
        snapshotSeq: ++this.packetSequence,
        snapshot: network
          ? this.battle.networkSnapshot()
          : this.battle.snapshot(),
        events: C.clone(this.history),
        ack: [...this.peers.values()].map((p) => ({
          entityId: p.entityId,
          seq: p.seq,
        })),
      };
    }
  }
  class Replica {
    constructor() {
      this.matchId = null;
      this.epoch = null;
      this.entityId = null;
      this.previous = null;
      this.current = null;
      this.seenEvent = 0;
      this.snapshotSequence = 0;
      this.connection = null;
    }
    welcome(raw) {
      const m = decode(raw);
      if (
        m.version !== VERSION ||
        m.type !== "welcome" ||
        m.pluginManifest !== C.PLUGIN_MANIFEST ||
        !id(m.matchId) ||
        !integer(m.epoch, 1) ||
        !id(m.entityId) ||
        !integer(m.connection, 1) ||
        m.tickRate !== C.TICK_RATE
      )
        throw new Error("Invalid welcome");
      this.matchId = m.matchId;
      this.epoch = m.epoch;
      this.entityId = m.entityId;
      this.previous = this.current = null;
      this.seenEvent = 0;
      this.snapshotSequence = 0;
      this.connection = m.connection;
    }
    receive(raw) {
      try {
        const m = decode(raw);
        if (
          m.version !== VERSION ||
          m.type !== "state" ||
          m.matchId !== this.matchId ||
          m.epoch !== this.epoch
        )
          throw new Error("Wrong match");
        if (
          !integer(m.snapshotSeq, 1) ||
          m.snapshotSeq <= this.snapshotSequence
        )
          throw new Error("Old snapshot packet");
        const s = validateSnapshot(m.snapshot, {
          network: m.snapshot?.kind === "network",
        });
        if (s.matchId !== this.matchId || s.epoch !== this.epoch)
          throw new Error("Snapshot mismatch");
        if (this.current && s.tick < this.current.tick)
          throw new Error("Old snapshot");
        if (!Array.isArray(m.events) || m.events.length > 256)
          throw new Error("Invalid events");
        const types = [
          "shot",
          "beam",
          "impact",
          "explosion",
          "damage",
          "destroy",
          "fallStart",
          "land",
          "rampEnter",
          "rampExit",
          "respawn",
          "pickup",
          "ability",
          "end",
        ];
        let last = 0;
        for (const e of m.events) {
          if (
            !plain(e) ||
            !integer(e.eventId, 1) ||
            e.eventId <= last ||
            e.epoch !== this.epoch ||
            !integer(e.tick, 0, s.tick) ||
            !types.includes(e.type)
          )
            throw new Error("Invalid event");
          last = e.eventId;
          for (const key of ["x", "y", "z", "power"])
            if (e[key] !== undefined && !number(e[key], -200, 200))
              throw new Error("Invalid effect");
          if (e.type === "beam")
            for (const p of [e.from, e.to])
              if (
                !plain(p) ||
                !number(p.x, -220, 220) ||
                !number(p.z, -220, 220) ||
                !number(p.y, -90, 110)
              )
                throw new Error("Invalid beam");
        }
        this.snapshotSequence = m.snapshotSeq;
        const events = m.events.filter((e) => e.eventId > this.seenEvent);
        if (events.length) this.seenEvent = events.at(-1).eventId;
        if (!this.current || s.tick > this.current.tick) {
          this.previous = this.current;
          this.current = s;
        } else this.current = s;
        return { ok: true, events };
      } catch (error) {
        return { ok: false, reason: error.message, events: [] };
      }
    }
    renderState(alpha = 1) {
      if (!this.current) return null;
      const state = C.clone(this.current);
      if (!this.previous) return state;
      const t = Math.max(0, Math.min(1, alpha));
      for (const e of state.entities) {
        const before = this.previous.entities.find((p) => p.id === e.id);
        if (!before || before.alive !== e.alive) continue;
        // Interpolate continuous slope height with planar movement.
        for (const axis of ["x", "y", "z"])
          e[axis] = before[axis] + (e[axis] - before[axis]) * t;
        for (const axis of ["heading", "aim"])
          e[axis] = C.turn(
            before[axis],
            e[axis],
            Math.abs(C.wrap(e[axis] - before[axis])) * t,
          );
      }
      return state;
    }
  }
  class LocalSession {
    constructor({
      loadout = { tankType: "medium", weaponType: "standard" },
      participants = null,
    } = {}) {
      this.epoch = 0;
      this.loadout = loadout;
      this.participants = participants;
      this.restart(loadout);
    }
    restart(loadout = this.loadout) {
      this.loadout = { ...loadout };
      this.epoch++;
      this.authority = new Authority({
        matchId: "local",
        epoch: this.epoch,
        participants: this.participants || C.defaultParticipants(loadout),
      });
      this.replica = new Replica();
      this.replica.welcome(
        this.authority.attach(
          "local-peer",
          this.authority.battle.entities.find((e) => e.controller === "human")
            .id,
        ),
      );
      this.sequence = 0;
      this.accumulator = 0;
      this.sync();
    }
    sync() {
      const result = this.replica.receive(this.authority.statePacket());
      if (!result.ok) throw new Error(result.reason);
      return result.events;
    }
    start() {
      this.authority.battle.start();
      this.sync();
    }
    pause() {
      this.authority.battle.pause();
      for (const peer of this.authority.peers.values())
        this.authority.battle.releaseControl(peer.entityId);
      this.authority.commands.clear();
      this.accumulator = 0;
      this.sync();
    }
    advance(seconds, input = {}) {
      if (this.authority.battle.status !== "playing") return [];
      this.authority.receive("local-peer", {
        version: VERSION,
        type: "input",
        matchId: "local",
        epoch: this.epoch,
        seq: this.sequence++,
        clientTick: this.authority.battle.tick + 1,
        connection: this.replica.connection,
        input,
      });
      this.accumulator += Math.min(0.25, Math.max(0, seconds));
      const events = [];
      while (this.accumulator + 1e-9 >= C.DT) {
        this.authority.step();
        this.accumulator -= C.DT;
        events.push(...this.sync());
      }
      return events;
    }
    state() {
      return this.replica.renderState(Math.max(0, this.accumulator / C.DT));
    }
    current() {
      return this.replica.current;
    }
    get playerId() {
      return this.replica.entityId;
    }
  }
  return {
    Authority,
    Replica,
    LocalSession,
    validateSnapshot,
    decode,
    INPUT_TIMEOUT,
    VERSION,
  };
});
