/* Cooperative survival rules. Only the authority drives spawning, damage and rewards. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent, node ? require("./roguelike.js") : root.TankSystems.roguelike);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).pve = api;
})(typeof window === "undefined" ? globalThis : window, function (C, R) {
  "use strict";
  const MAX_ZOMBIES = 16;
  const rewards = Object.freeze({
    ...R.rewards,
    medkit: { name: "急救补给", description: "立即恢复 60 生命" },
    haste: { name: "快速装填", description: "装填时间减少 10%，最多叠加 3 次" },
    regen: { name: "自愈因子", description: "每秒恢复 1 生命，最多叠加 3 次" },
    nova: { name: "电磁脉冲", description: "每 4 秒对 5 米内可见僵尸造成 20 伤害，最多叠加 3 次" },
    rapid: { name: "快速炮", description: "替换当前武器，适合持续压制尸群" },
    rocket: { name: "火箭筒", description: "替换当前武器，爆炸可伤害多只僵尸；合作模式无友伤" },
    laser: { name: "激光炮", description: "替换当前武器，固定 100 伤害，预热 1.5 秒并穿透直线上的敌人" },
  });
  const survivors = (b) => b.entities.filter((e) => e.tankType !== "zombie");
  const zombies = (b) => b.entities.filter((e) => e.tankType === "zombie");
  const composition = ["walker", "walker", "cone", "walker", "runner", "cone", "bucket", "runner", "brute", "walker"];
  function healthFor(type, teamSize) {
    return Math.round(C.ZOMBIE_SPECS[type].hp * (1 + C.RULES.pveHealthPerPlayer * (teamSize - 1)));
  }
  function typeFor(wave, ordinal) {
    const type = composition[(wave * 3 + ordinal) % composition.length];
    return C.ZOMBIE_SPECS[type].wave <= wave ? type : "walker";
  }
  function initialize(b) {
    b.pve = { teamSize: survivors(b).length, wave: 0, nextWaveAt: 180, queue: 0, nextSpawnAt: 0, result: null,
      choices: {}, upgrades: {} };
    R.initialize(b);
    const template = b.entities[0];
    for (let i = 0; i < MAX_ZOMBIES; i++) b.entities.push({
      ...C.clone(template), id: "zombie_" + i, controller: "bot", tankType: "zombie",
      slowUntil: 0, ammo: 0, weaponType: "standard", zombieType: "walker", alive: false, hp: 0, maxHp: healthFor("walker", b.pve.teamSize),
      protectedUntil: 0, respawnAt: 0,
    });
  }
  function choose(b, id, wave, choice, offerId = b.pve?.choiceIds[id]) {
    if (b.mode !== "pve" || b.status !== "playing" || wave !== b.pve.wave ||
        !b.pve.pending[id] || offerId !== b.pve.choiceIds[id] || !b.pve.choices[id]?.includes(choice)) return false;
    const p = b.getEntity(id), upgrades = b.pve.upgrades[id];
    if (!p || p.forfeited || !p.alive) return false;
    if (choice === "medkit") p.hp = Math.min(p.maxHp, p.hp + 60);
    else if (Object.hasOwn(upgrades, choice)) upgrades[choice] = Math.min(R.caps[choice], upgrades[choice] + 1);
    else {
      p.weaponType = choice;
      p.ammo = C.WEAPONS[choice].magazineSize || 0;
      p.cooldown = 0;
      p.charge = 0;
      p.criticalProgress = 0;
      p.fireHeld = false;
      p.needsRelease = true;
    }
    R.complete(b, p, rewards);
    return true;
  }
  function spawn(b, z, forcedType = null) {
    const players = survivors(b).filter((p) => p.alive && !p.forfeited);
    const target = players[(b.pve.queue + Number(z.id.slice(7))) % players.length];
    if (!target) return false;
    const zombieType = forcedType || typeFor(b.pve.wave, b.pve.queue);
    const maxHp = healthFor(zombieType, b.pve.teamSize);
    // Fixed candidates keep checkpoint replay deterministic; reject walls and occupied cells.
    for (let i = 0; i < 32; i++) {
      const angle = (i + b.pve.queue * 7 + b.pve.wave * 3) * Math.PI * 2 / 32;
      const distance = 18 + (i % 3) * 3;
      const x = target.x + Math.cos(angle) * distance, zz = target.z + Math.sin(angle) * distance;
      if (!b.valid(x, zz, target.floor, z)) continue;
      Object.assign(z, { x, z: zz, y: b.map.levels[target.floor].y, floor: target.floor,
        zombieType, maxHp, slowUntil: 0,
        alive: true, hp: maxHp, speed: 0, cooldown: 0, charge: 0, criticalProgress: 0,
        falling: false, fallVelocity: 0, fallVX: 0, fallVZ: 0, rampId: null, rampDir: 0,
        protectedUntil: b.tick + 60, respawnAt: b.tick, heading: C.wrap(angle), aim: C.wrap(angle),
        brain: { path: [], target: null, pathTick: 0, blocked: 0 } });
      b.emit("respawn", { id: z.id });
      return true;
    }
    return false;
  }
  function resupply(b, players) {
      for (const p of players) {
        if (!p.alive) {
          const spawnPoint = b.map.spawns.find((s) => b.valid(s.x, s.z, s.floor, p));
          if (!spawnPoint) continue;
          Object.assign(p, { x: spawnPoint.x, z: spawnPoint.z, floor: spawnPoint.floor,
            y: b.map.levels[spawnPoint.floor].y, alive: true, hp: p.maxHp,
            falling: false, fallVelocity: 0, fallVX: 0, fallVZ: 0, rampId: null, rampDir: 0,
            protectedUntil: b.tick + 120, respawnAt: b.tick, speed: 0 });
          b.emit("respawn", { id: p.id });
        }
        p.hp = Math.min(p.maxHp, p.hp + 20);

      }
  }
  function step(b) {
    const pve = b.pve, players = survivors(b).filter((p) => !p.forfeited);
    const teamSize = Math.max(1, players.length);
    if (teamSize !== pve.teamSize) {
      for (const z of zombies(b)) {
        const maxHp = healthFor(z.zombieType, teamSize);
        z.hp = z.alive ? Math.max(1, Math.ceil(z.hp * maxHp / z.maxHp)) : 0;
        z.maxHp = maxHp;
      }
      pve.teamSize = teamSize;
    }
    for (const id of Object.keys(pve.choices))
      if (!players.some((p) => p.id === id)) { delete pve.choices[id]; delete pve.choiceIds[id]; pve.pending[id] = 0; }
    if (!players.some((p) => p.alive) || pve.boss.defeated || b.tick >= C.RULES.duration) {
      pve.result = players.some((p) => p.alive) && pve.boss.defeated ? "victory" : "defeat";
      b.status = "finished";
      b.winnerId = null;
      pve.choices = {};
      pve.choiceIds = {};
      pve.boss.telegraph = null;
      b.emit("end", { winnerId: null });
      return;
    }
    R.tick(b);
    for (const p of players) {
      if (!p.alive) continue;
      const upgrades = pve.upgrades[p.id];
      if (b.tick % 60 === 0 && upgrades.regen) p.hp = Math.min(p.maxHp, p.hp + upgrades.regen);
      if (b.tick % 240 === 0 && upgrades.nova) {
        for (const z of zombies(b)) {
          if (!z.alive || Math.hypot(z.x - p.x, z.y - p.y, z.z - p.z) > 5 + upgrades.novaRange * 1.5 || !b.sight(p, z)) continue;
          b.damage(z, 20 * upgrades.nova * (upgrades.shatter && z.slowUntil > b.tick ? 2 : 1), p.id, { x: z.x, y: z.y + 1, z: z.z });
          if (upgrades.frost) z.slowUntil = b.tick + 300;
          b.emit("beam", { id: p.id, radius: 0.1, power: 0.3,
            from: { x: p.x, y: p.y + 1.5, z: p.z }, to: { x: z.x, y: z.y + 1.5, z: z.z } });
        }
      }
    }
    if (b.tick >= C.RULES.duration - 3600 && !pve.boss.spawned) {
      const boss = zombies(b).at(-1);
      if (spawn(b, boss, "boss")) {
        pve.boss.spawned = true; pve.boss.nextAttackAt = b.tick + 180;
        pve.queue = 0; pve.nextWaveAt = 0;
        for (const z of zombies(b)) if (z !== boss) { z.alive = false; z.hp = 0; z.speed = 0; z.criticalProgress = 0; }
        resupply(b, players);
      }
    }
    if (pve.boss.spawned) {
      R.bossAttack(b);
      const boss = zombies(b).find((z) => z.zombieType === "boss" && z.alive),
        support = zombies(b).filter((z) => z.zombieType !== "boss" && z.alive),
        supportLimit = Math.min(6, players.length + 2);
      if (boss && support.length < supportLimit && b.tick % 180 === 0) {
        const vacant = zombies(b).find((z) => z.zombieType !== "boss" && !z.alive);
        if (vacant) {
          const type = pve.wave >= 3 &&
              (b.tick / 180 + Number(vacant.id.slice(7))) % 3 === 0
            ? "runner"
            : "walker";
          spawn(b, vacant, type);
        }
      }
      return;
    }
    if (pve.nextWaveAt) {
      if (b.tick < pve.nextWaveAt) return;
      pve.nextWaveAt = 0;
      pve.wave++;
      pve.queue = Math.min(64, 4 + pve.wave * 2 + (players.length - 1) * 3);
      pve.nextSpawnAt = b.tick;
    }
    if (pve.queue && b.tick >= pve.nextSpawnAt) {
      const vacant = zombies(b).find((z) => !z.alive);
      if (vacant && spawn(b, vacant)) pve.queue--;
      pve.nextSpawnAt = b.tick + 30;
    }
    if (!pve.queue && !zombies(b).some((z) => z.alive)) {
      // Dead teammates return only after the team clears a wave.
      resupply(b, players);
      pve.nextWaveAt = b.tick + 900;
    }
  }
  function validate(s) {
    const p = s.pve;
    const int = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
    const plain = (o) => o && typeof o === "object" && !Array.isArray(o);
    const players = survivors(s), enemies = zombies(s);
    if (!plain(p) || !int(p.teamSize, C.MAX_PLAYERS) || p.teamSize < 1 || !int(p.wave, 1000) || !int(p.queue, 64) || !int(p.nextWaveAt) || !int(p.nextSpawnAt) ||
        ![null, "victory", "defeat"].includes(p.result) || !plain(p.choices) || !plain(p.upgrades) ||
        p.teamSize > players.length || players.length < 1 || players.length > C.MAX_PLAYERS || enemies.length !== MAX_ZOMBIES ||
        players.some((e) => e.controller !== "human" || e.tankType !== "human") ||
        enemies.some((e, i) => e.id !== "zombie_" + i || e.controller !== "bot" || e.weaponType !== "standard" || !Object.hasOwn(C.ZOMBIE_SPECS, e.zombieType) ||
          C.ZOMBIE_SPECS[e.zombieType].wave > Math.max(1, p.wave)) ||
        Object.keys(p.upgrades).length !== players.length ||
        (s.status === "finished") !== (p.result !== null)) throw new Error("Invalid PvE state");
    R.validate(s);
    for (const [id, choices] of Object.entries(p.choices)) {
      if (!players.some((e) => e.id === id) || !Array.isArray(choices) || choices.length !== 3 ||
          new Set(choices).size !== 3 || choices.some((c) => !Object.hasOwn(rewards, c))) throw new Error("Invalid PvE choices");
    }
  }
  return Object.freeze({ MAX_ZOMBIES, rewards, progression: R, healthFor, typeFor, initialize, choose, step, validate });
});
