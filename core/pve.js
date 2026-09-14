/* Cooperative survival rules. Only the authority drives spawning, damage and rewards. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent, node ? require("./roguelike.js") : root.TankSystems.roguelike);
  if (node) module.exports = api;
  else (root.TankSystems ??= {}).pve = api;
})(typeof window === "undefined" ? globalThis : window, function (C, R) {
  "use strict";
  const MAX_REGULAR_ZOMBIES = 32, MAX_ZOMBIES = 33;
  const rewards = Object.freeze({
    ...R.rewards,
    haste: { name: "快速装填", description: "装填时间减少 10%，最多叠加 3 次" },
    regen: { name: "自愈因子", description: "每秒恢复 1 生命，最多叠加 3 次" },
    standard: { name: "标准炮", description: "替换当前武器，以暴击震荡和处决巨型感染者" },
    rapid: { name: "快速炮", description: "替换当前武器，适合持续压制尸群" },
    rocket: { name: "火箭筒", description: "替换当前武器，爆炸可伤害多只僵尸；合作模式无友伤" },
    laser: { name: "激光炮", description: "替换当前武器，固定 100 伤害，预热 1.5 秒并穿透直线上的敌人" },
  });
  const survivors = (b) => b.entities.filter((e) => e.tankType !== "zombie");
  const zombies = (b) => b.entities.filter((e) => e.tankType === "zombie");
  const earlyComposition = ["walker", "walker", "cone", "walker", "runner", "cone", "bucket", "runner", "walker", "cone"],
    lateComposition = ["brute", "runner", "bucket", "brute", "cone", "runner", "brute", "bucket"];
  const bossTypes = new Set(["boss", "titan"]);
  function healthFor(type, teamSize, wave = 1) {
    const teamScale = 1 + C.RULES.pveHealthPerPlayer * (teamSize - 1),
      waveScale = 1 + C.RULES.pveHealthPerWave * (Math.max(1, wave) - 1),
      ordinaryScale = bossTypes.has(type) ? 1 : 0.5;
    return Math.round(C.ZOMBIE_SPECS[type].hp * ordinaryScale * teamScale * waveScale);
  }
  function rescaleHealth(b, teamSize, wave) {
    for (const z of zombies(b)) {
      const maxHp = healthFor(z.zombieType, teamSize, wave);
      z.hp = z.alive ? Math.max(1, Math.ceil(z.hp * maxHp / z.maxHp)) : 0;
      z.maxHp = maxHp;
    }
  }
  function typeFor(wave, ordinal, risky = false) {
    if (risky && ordinal % 3 === 0) return "runner";
    const pool = wave > 8 ? lateComposition : earlyComposition,
      type = pool[(wave * 3 + ordinal) % pool.length];
    return C.ZOMBIE_SPECS[type].wave <= wave ? type : "walker";
  }
  function initialize(b) {
    b.pve = { teamSize: survivors(b).length, wave: 0, nextWaveAt: 180, queue: 0, nextSpawnAt: 0, result: null,
      riskyWave: 0, enemyAttacks: [], choices: {}, upgrades: {} };
    R.initialize(b);
    const template = b.entities[0];
    for (let i = 0; i < MAX_ZOMBIES; i++) b.entities.push({
      ...C.clone(template), id: "zombie_" + i, controller: "bot", tankType: "zombie",
      slowUntil: 0, ammo: 0, weaponType: "standard", zombieType: "walker", alive: false, hp: 0, maxHp: healthFor("walker", b.pve.teamSize),
      protectedUntil: 0, respawnAt: 0,
    });
  }
  function choose(b, id, wave, choice, offerId = b.pve?.choiceIds[id]) {
    if (b.mode !== "pve" || b.status !== "playing" || !Number.isSafeInteger(wave) || wave < 0 || wave > b.pve.wave ||
        !b.pve.pending[id] || offerId !== b.pve.choiceIds[id] || !b.pve.choices[id]?.includes(choice)) return false;
    const p = b.getEntity(id), upgrades = b.pve.upgrades[id];
    if (!p || p.forfeited || !p.alive) return false;
    const reward=rewards[choice];
    if (!reward || (reward.requires && !upgrades[reward.requires]) ||
        (reward.weapon && reward.weapon!==p.weaponType) || !R.branches.allowed(upgrades,choice) ||
        (R.caps[choice] && upgrades[choice]>=R.caps[choice])) return false;
    if (Object.hasOwn(upgrades, choice)) upgrades[choice] = Math.min(R.caps[choice], upgrades[choice] + 1);
    else {
      p.weaponType = choice;
      p.ammo = C.WEAPONS[choice].magazineSize || 0;
      p.cooldown = 0;
      p.charge = 0;
      p.criticalProgress = 0;
      p.fireHeld = false;
      p.needsRelease = true;
    }
    if (!Object.hasOwn(upgrades,choice)) R.branches.reset(b,p);
    if (choice==='lightMagazine' || (!Object.hasOwn(upgrades,choice) && p.weaponType==='pistol' && upgrades.lightMagazine)) {
      p.ammo=4; p.cooldown=0; R.branches.reload(b,p);
    }
    if (choice==='chargeCore') { p.charge=0; p.fireHeld=false; p.needsRelease=true; }
    R.complete(b, p, rewards);
    return true;
  }
  function spawn(b, z, forcedType = null) {
    const players = survivors(b).filter((p) => p.alive && !p.forfeited);
    const target = players[(b.pve.queue + Number(z.id.slice(7))) % players.length];
    if (!target) return false;
    const zombieType = forcedType || typeFor(b.pve.wave, b.pve.queue, b.pve.riskyWave === b.pve.wave);
    const maxHp = healthFor(zombieType, b.pve.teamSize, b.pve.wave);
    // Fixed candidates keep checkpoint replay deterministic; reject walls and occupied cells.
    for (let i = 0; i < 32; i++) {
      const angle = (i + b.pve.queue * 7 + b.pve.wave * 3) * Math.PI * 2 / 32;
      const distance = 18 + (i % 3) * 3;
      const x = target.x + Math.cos(angle) * distance, zz = target.z + Math.sin(angle) * distance;
      if (!b.valid(x, zz, target.floor, z)) continue;
      delete b.pve.moduleStatus[z.id];
      b.pve.enemyAttacks = b.pve.enemyAttacks.filter(a=>a.owner!==z.id);
      Object.assign(z, { x, z: zz, y: C.groundHeight(b.map,x,zz,target.floor), floor: target.floor,
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
            y: C.groundHeight(b.map,spawnPoint.x,spawnPoint.z,spawnPoint.floor), alive: true, hp: p.maxHp,
            falling: false, fallVelocity: 0, fallVX: 0, fallVZ: 0, rampId: null, rampDir: 0,
            protectedUntil: b.tick + 120, respawnAt: b.tick, speed: 0 });
          b.emit("respawn", { id: p.id });
        }
        p.hp = Math.min(p.maxHp, p.hp + 20);

      }
  }
  function startBoss(b, players, stage) {
    const boss = zombies(b).at(-1), type = stage === 1 ? "boss" : "titan";
    if (!spawn(b, boss, type)) return false;
    Object.assign(b.pve.boss, { stage, spawned: true, defeated: false,
      nextAttackAt: b.tick + (stage === 1 ? 180 : 150), telegraph: null });
    b.pve.enemyAttacks = [];
    b.pve.queue = 0; b.pve.nextWaveAt = 0;
    for (const z of zombies(b)) if (z !== boss) {
      z.alive = false; z.hp = 0; z.speed = 0; z.criticalProgress = 0;
      delete b.pve.moduleStatus[z.id];
    }
    resupply(b, players);
    return true;
  }
  function enemyAttacks(b) {
    const p = b.pve, roster = zombies(b), humans = survivors(b).filter(h=>h.alive&&!h.forfeited);
    p.enemyAttacks = p.enemyAttacks.filter(a=>roster.some(z=>z.id===a.owner&&z.alive));
    for(const a of p.enemyAttacks) {
      const z = b.getEntity(a.owner);
      if(a.phase==='warn' && b.tick>=a.at) {
        if(b.tick>a.at){a.phase='expired';continue;}
        a.ox=z.x;a.oz=z.z;
        if(a.kind==='cone') { a.phase='flight';a.x=z.x;a.z=z.z;a.at=a.castTick+48+120; }
        else {
          a.phase='dash';a.x=z.x;a.z=z.z;a.at=a.castTick+42+15;
          z.heading=Math.atan2(a.tz-z.z,-(a.tx-z.x));z.abilityUntil=b.tick+15;
        }
      } else if(a.phase==='flight') {
        const dx=a.tx-a.x,dz=a.tz-a.z,length=Math.hypot(dx,dz),step=Math.min(.15,length),
          nx=a.x+(length?dx/length*step:0),nz=a.z+(length?dz/length*step:0),
          from={x:a.x,y:z.y+1.5,z:a.z},to={x:nx,y:z.y+1.5,z:nz},
          hit=b.collision(from,to,z.id,{radius:.18,ignoreIds:roster.map(e=>e.id)});
        if(hit) {
          if(hit.kind==='tank') {
            const victim=b.getEntity(hit.id);
            if(victim?.tankType!=='zombie') b.damage(victim,12+Math.min(16,p.wave*2),z.id,hit.point);
          }
          a.phase='cooldown';a.at=b.tick+240;
          b.emit('impact',{x:hit.point.x,y:hit.point.y,z:hit.point.z});
        } else if(length<=step || b.tick>=a.at) {a.phase='cooldown';a.at=b.tick+240;}
        else {a.x=nx;a.z=nz;}
      } else if(a.phase==='dash') {
        const victim=humans.find(h=>h.floor===z.floor&&Math.hypot(h.x-z.x,h.z-z.z)<2&&b.sight(z,h));
        if(victim){b.damage(victim,8+Math.min(16,p.wave*2),z.id,{x:victim.x,y:victim.y+1,z:victim.z});z.cooldown=C.ZOMBIE_SPECS.runner.meleeCooldown;a.phase='cooldown';a.at=b.tick+240;z.abilityUntil=b.tick;}
        else if(z.brain.blocked>0){a.phase='stun';a.at=b.tick+60;z.abilityUntil=b.tick;
          z.brain.path=[];z.brain.pathTick=0;z.brain.target=null;}
        else if(b.tick>=a.at){a.phase='cooldown';a.at=b.tick+240;z.abilityUntil=b.tick;}
        a.x=z.x;a.z=z.z;
      } else if(b.tick>=a.at) a.phase='expired';
    }
    p.enemyAttacks=p.enemyAttacks.filter(a=>a.phase!=='expired');
    if(p.boss.spawned)return;
    for(const z of roster) {
      if(!z.alive || p.enemyAttacks.some(a=>a.owner===z.id))continue;
      const cone=z.zombieType==='cone'&&p.wave>=4,runner=z.zombieType==='runner'&&p.wave>=6;
      if(!cone&&!runner)continue;
      const target=humans.filter(h=>h.floor===z.floor).sort((a,c)=>Math.hypot(a.x-z.x,a.z-z.z)-Math.hypot(c.x-z.x,c.z-z.z))[0];
      if(!target)continue;
      const distance=Math.hypot(target.x-z.x,target.z-z.z);
      if(distance<(cone?6:3.2)||distance>(cone?14:5.2)||!b.sight(z,target))continue;
      p.enemyAttacks.push({owner:z.id,kind:cone?'cone':'runner',phase:'warn',castTick:b.tick,at:b.tick+(cone?48:42),
        ox:z.x,oz:z.z,x:z.x,z:z.z,tx:target.x,tz:target.z});
    }
  }
  function step(b) {
    const pve = b.pve, players = survivors(b).filter((p) => !p.forfeited);
    const teamSize = Math.max(1, players.length);
    if (teamSize !== pve.teamSize) {
      rescaleHealth(b, teamSize, pve.wave);
      pve.teamSize = teamSize;
    }
    for (const id of Object.keys(pve.choices))
      if (!players.some((p) => p.id === id)) { delete pve.choices[id]; delete pve.choiceIds[id]; pve.pending[id] = 0; }
    if (!players.some((p) => p.alive) || pve.boss.defeated) {
      pve.result = players.some((p) => p.alive) && pve.boss.defeated ? "victory" : "defeat";
      b.status = "finished";
      b.winnerId = null;
      pve.choices = {};
      pve.choiceIds = {};
      pve.enemyAttacks = [];
      pve.branchZones = []; pve.branchEchoes = [];
      pve.boss.telegraph = null;
      b.emit("end", { winnerId: null });
      return;
    }
    R.tick(b);
    enemyAttacks(b);
    for (const p of players) {
      if (!p.alive) continue;
      const upgrades = pve.upgrades[p.id];
      if (b.tick % 60 === 0 && upgrades.regen) p.hp = Math.min(p.maxHp, p.hp + upgrades.regen);
    }
    if (pve.boss.spawned) {
      R.bossAttack(b);
      const boss = zombies(b).find((z) => bossTypes.has(z.zombieType) && z.alive),
        support = zombies(b).filter((z) => !bossTypes.has(z.zombieType) && z.alive),
        supportLimit = Math.min(6, players.length + 2);
      if (boss && support.length < supportLimit && b.tick % 180 === 0) {
        const vacant = zombies(b).find((z) => !bossTypes.has(z.zombieType) && !z.alive);
        if (vacant) {
          const late = pve.wave > 8,
            type = late
              ? ((b.tick / 180 + Number(vacant.id.slice(7))) % 3 === 0 ? "runner" : "brute")
              : ((b.tick / 180 + Number(vacant.id.slice(7))) % 3 === 0 ? "runner" : "cone");
          spawn(b, vacant, type);
        }
      }
      return;
    }
    if (pve.nextWaveAt) {
      if (b.tick < pve.nextWaveAt) return;
      const risk = [5, 11].includes(pve.wave + 1);
      pve.nextWaveAt = 0;
      pve.wave++;
      pve.riskyWave = risk ? pve.wave : 0;
      rescaleHealth(b, pve.teamSize, pve.wave);
      if (pve.wave === 8 || pve.wave === 16) {
        const stage = pve.wave === 8 ? 1 : 2;
        if (!startBoss(b, players, stage)) {
          pve.wave--; rescaleHealth(b, pve.teamSize, pve.wave); pve.nextWaveAt = b.tick + 1;
        }
        return;
      }
      pve.queue = Math.min(64, 4 + pve.wave * 2 + (players.length - 1) * 3 + (risk ? 4 : 0));
      pve.nextSpawnAt = b.tick;
    }
    if (pve.queue && b.tick >= pve.nextSpawnAt) {
      const regular = zombies(b).slice(0, MAX_REGULAR_ZOMBIES),
        vacant = regular.find((z) => !z.alive);
      if (vacant && spawn(b, vacant)) pve.queue--;
      pve.nextSpawnAt = b.tick + 30;
    }
    if (!pve.queue && !zombies(b).some((z) => z.alive)) {
      // Dead teammates return only after the team clears a wave.
      resupply(b, players);
      pve.nextWaveAt = b.tick + 10 * C.TICK_RATE;
    }
  }
  function validate(s) {
    const p = s.pve;
    const int = (n, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(n) && n >= 0 && n <= max;
    const plain = (o) => o && typeof o === "object" && !Array.isArray(o);
    const players = survivors(s), enemies = zombies(s), map = C.mapForMode(s.mode);
    if (!plain(p) || !int(p.teamSize, C.MAX_PLAYERS) || p.teamSize < 1 || !int(p.wave, 16) || !int(p.queue, 64) || !int(p.nextWaveAt) || !int(p.nextSpawnAt) ||
        ![null, "victory", "defeat"].includes(p.result) || !plain(p.choices) || !plain(p.upgrades) ||
        p.teamSize > players.length || players.length < 1 || players.length > C.MAX_PLAYERS || enemies.length !== MAX_ZOMBIES ||
        players.some((e) => e.controller !== "human" || e.tankType !== "human") ||
        enemies.some((e, i) => e.id !== "zombie_" + i || e.controller !== "bot" || e.weaponType !== "standard" || !Object.hasOwn(C.ZOMBIE_SPECS, e.zombieType) ||
          C.ZOMBIE_SPECS[e.zombieType].wave > Math.max(1, p.wave) || (e.alive && p.wave > 8 && e.zombieType === "walker")) ||
        Object.keys(p.upgrades).length !== players.length ||
        (s.status === "finished") !== (p.result !== null)) throw new Error("Invalid PvE state");
    if (!int(p.riskyWave, 16) || (p.riskyWave !== 0 &&
        (![5, 11].includes(p.riskyWave) || p.riskyWave !== p.wave))) throw Error("Invalid PvE trial");
    const validAttackTimeline=(a,z)=>{
      const start=a.castTick+(a.kind==='cone'?48:42),
        dx=a.tx-a.ox,dz=a.tz-a.oz,range=Math.hypot(dx,dz),
        along=((a.x-a.ox)*dx+(a.z-a.oz)*dz)/range,
        lateral=Math.abs((a.x-a.ox)*dz-(a.z-a.oz)*dx)/range,
        elapsed=s.tick-start;
      if(!int(a.castTick,s.tick)||!Number.isFinite(range)||lateral>.1||along<-.05||along>range+.05||
          range<(a.kind==='cone'?5.6:3)||range>(a.kind==='cone'?14.2:5.4))return false;
      if(a.phase==='warn')return a.at===start && s.tick<start &&
        Math.hypot(a.x-a.ox,a.z-a.oz)<.001 &&
        Math.hypot(z.x-a.ox,z.z-a.oz)<=.3+(s.tick-a.castTick)*C.ZOMBIE_SPECS[a.kind].speed/60;
      if(a.phase==='flight')return a.at===start+120 && elapsed>=0 && elapsed<120 &&
        lateral<.03 && along>=Math.min(range,elapsed*.15)-.16 &&
        along<=Math.min(range,elapsed*.15)+.03 &&
        Math.hypot(z.x-a.ox,z.z-a.oz)<=.3+elapsed*C.ZOMBIE_SPECS.cone.speed/60;
      if(a.phase==='dash')return a.at===start+15 && elapsed>=0 && elapsed<15 &&
        lateral<.1 && along>=-.03 && along<=Math.min(range,elapsed*16/60)+.3 &&
        Math.hypot(z.x-a.x,z.z-a.z)<.001;
      if(a.phase==='stun')return a.kind==='runner'&&elapsed>=0 && a.at<=s.tick+60;
      return a.phase==='cooldown' && elapsed>=0;
    };
    if (!Array.isArray(p.enemyAttacks) || p.enemyAttacks.length > MAX_REGULAR_ZOMBIES ||
        new Set(p.enemyAttacks.map(a=>a?.owner)).size !== p.enemyAttacks.length ||
        p.enemyAttacks.some(a=>{
          if(!plain(a))return true;
          const z=enemies.find(e=>e.id===a.owner);
          return Object.keys(a).sort().join()!=="at,castTick,kind,owner,ox,oz,phase,tx,tz,x,z" ||
            !z?.alive||p.boss.spawned||
            (a.kind==='cone'?(z.zombieType!=='cone'||p.wave<4||!['warn','flight','cooldown'].includes(a.phase)):
              a.kind==='runner'?(z.zombieType!=='runner'||p.wave<6||!['warn','dash','stun','cooldown'].includes(a.phase)):true)||
            !int(a.at,s.tick+240)||a.at<=s.tick||
            !['x','z','tx','tz','ox','oz'].every(k=>Number.isFinite(a[k])&&Math.abs(a[k])<=map.worldLimit)||
            !validAttackTimeline(a,z);
        })) throw Error("Invalid PvE attack");
    R.validate(s);
    if (p.result === "victory" && !(p.boss.stage === 2 && p.boss.spawned && p.boss.defeated))
      throw Error("Invalid PvE victory");
    for (const [id, choices] of Object.entries(p.choices)) {
      if (!players.some((e) => e.id === id) || !Array.isArray(choices) || choices.length !== 3 ||
          new Set(choices).size !== 3 || choices.some((c) => !Object.hasOwn(rewards, c))) throw new Error("Invalid PvE choices");
    }
  }
  return Object.freeze({ MAX_ZOMBIES, rewards, progression: R, healthFor, typeFor, initialize, choose, step, validate });
});
