/* Authoritative run progression and bounded skill effects. No recursive explosions. */
(function(root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent,
    node ? require("./modules.js") : root.TankSystems.modules);
  if (node) module.exports = api; else (root.TankSystems ??= {}).roguelike = api;
})(typeof window === "undefined" ? globalThis : window, function(C,M) {
  "use strict";
  const rewards = Object.freeze({
    pistol: { name: "换装小手枪", description: "切换至小手枪，成长为雷神弹匣" },
    pierce: { name: "贯穿弹", description: "子弹向前贯穿最多 3 名敌人，每名 20 伤害", weapon: "pistol" },
    ricochet: { name: "双重弹射", description: "向 10 米内最多 2 名其他敌人弹射，各 20 伤害", requires: "pierce", weapon: "pistol" },
    lightning: { name: "高压弹匣", description: "每 2 次命中电击 12 米内最多 5 名敌人，各 35 伤害", requires: "ricochet", weapon: "pistol" },
    conductor: { name: "雷电网络", description: "电击额外跳跃一轮，单次最多命中 10 名不同敌人", requires: "lightning", weapon: "pistol" },
    thunder: { name: "雷神降临", description: "每个弹匣最后一发命中召唤 8 米、120 伤害雷暴", requires: "conductor", weapon: "pistol" },
    heavyShell: { name: "震荡重弹", description: "标准炮暴击产生 6 米、60 伤害震荡", weapon: "standard" },
    execution: { name: "处决弹", description: "暴击对巨人与 Boss 追加 100 伤害", requires: "heavyShell", weapon: "standard" },
    penetrator: { name: "钨芯贯甲弹", description: "暴击继续贯穿后方最多 2 名敌人，保持完整伤害", requires: "execution", weapon: "standard" },
    earthquake: { name: "地震弹头", description: "暴击改为 8 米、100 伤害震荡，并在半秒后追加 60 伤害", requires: "penetrator", weapon: "standard" },
    judgment: { name: "天罚炮弹", description: "暴击变为 200 直击、10 米 150 爆炸；对巨人与 Boss 追加 150", requires: "earthquake", weapon: "standard" },
    suppression: { name: "重度压制", description: "快速炮命中减速 50%，持续 3 秒", weapon: "rapid" },
    crossfire: { name: "交叉火力", description: "命中后对 8 米内另一名敌人追加 10 伤害", requires: "suppression", weapon: "rapid" },
    multiCross: { name: "多重交叉", description: "交叉火力扩大为最多 3 名敌人，各 15 伤害", requires: "crossfire", weapon: "rapid" },
    rupture: { name: "弱点撕裂", description: "命中已减速敌人额外造成 8 伤害", requires: "multiCross", weapon: "rapid" },
    metalStorm: { name: "金属风暴", description: "射速翻倍；每 5 次命中追踪攻击最多 8 名敌人，各 30 伤害", requires: "rupture", weapon: "rapid" },
    wideBeam: { name: "广角透镜", description: "激光束半径从 0.45 米提升至 1 米", weapon: "laser" },
    capacitor: { name: "聚能电容", description: "激光伤害从 100 提升至 150", requires: "wideBeam", weapon: "laser" },
    plasmaBurst: { name: "多重等离子", description: "前 3 个命中点各产生 4 米、60 伤害爆发", requires: "capacitor", weapon: "laser" },
    refraction: { name: "光棱折射", description: "每次发射额外折射至 12 米内最多 4 名敌人，各 100 伤害", requires: "plasmaBurst", weapon: "laser" },
    stellar: { name: "恒星射线", description: "1.5 米宽束、250 伤害、8 米 120 首爆并折射 6 名敌人", requires: "refraction", weapon: "laser" },
    blast: { name: "巨型弹头", description: "火箭爆炸半径提升至 10 米，中心伤害提升至 100", weapon: "rocket" },
    fire: { name: "烈焰地带", description: "留下 5 米燃烧区，持续 4 秒，每半秒 15 伤害", requires: "blast", weapon: "rocket" },
    chain: { name: "尸爆连锁", description: "击杀感染者触发 6 米、80 伤害尸爆；尸爆不递归", requires: "fire", weapon: "rocket" },
    cluster: { name: "集束弹头", description: "主爆炸后产生 5 个 4 米、50 伤害集束爆炸", requires: "chain", weapon: "rocket" },
    doomsday: { name: "末日弹头", description: "每第 3 发变为 16 米、200 伤害核爆，并留下 8 米辐射区", requires: "cluster", weapon: "rocket" },
    ...M.rewards,
  });
  const caps = Object.freeze({ haste:3, regen:3,
    pierce:1, ricochet:1, lightning:1, conductor:1, thunder:1,
    heavyShell:1, execution:1, penetrator:1, earthquake:1, judgment:1,
    suppression:1, crossfire:1, multiCross:1, rupture:1, metalStorm:1,
    wideBeam:1, capacitor:1, plasmaBurst:1, refraction:1, stellar:1,
    blast:1, fire:1, chain:1, cluster:1, doomsday:1,
    ...M.caps });
  const xpNeeded = level => 40 + (level - 1) * 20;
  const point = e => ({x:e.x,y:e.y+1.5,z:e.z});
  const enemies = b => b.entities.filter(e => e.tankType === "zombie" && e.alive);
  function initialize(b) {
    let seed = 2166136261;
    for (const ch of b.matchId + ":" + b.epoch) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    Object.assign(b.pve, { level:1, xp:0, rng:seed || 1, pending:{}, choiceIds:{}, nextChoiceId:1,
      hits:{}, rapidHits:{}, rocketShots:{}, hazards:[], bursts:[], nextHazard:1,
      boss:{ stage:0, spawned:false, defeated:false, nextAttackAt:0, telegraph:null } });
    for (const p of b.entities.filter(e=>e.tankType!=="zombie")) {
      b.pve.upgrades[p.id] = Object.fromEntries(Object.keys(caps).map(k=>[k,0]));
      b.pve.pending[p.id]=0; b.pve.hits[p.id]=0; b.pve.rapidHits[p.id]=0; b.pve.rocketShots[p.id]=0;
    }
    M.initialize(b);
  }
  function random(b) {
    let n=b.pve.rng; n^=n<<13; n^=n>>>17; n^=n<<5;
    b.pve.rng=n>>>0; return b.pve.rng/4294967296;
  }
  function offer(b,p,allRewards) {
    if (p.forfeited || !b.pve.pending[p.id] || b.pve.choices[p.id]) return;
    const upgrades=b.pve.upgrades[p.id];
    const pool=Object.keys(allRewards).filter(key=>{
      const r=allRewards[key];
      return key!==p.weaponType && (!caps[key] || upgrades[key]<caps[key]) &&
        (!r.requires || upgrades[r.requires]>0) && (!r.weapon || r.weapon===p.weaponType);
    });
    const choices=[];
    while(pool.length && choices.length<3) {
      const weight=key=>allRewards[key].weapon===p.weaponType?2:1;
      let roll=random(b)*pool.reduce((sum,key)=>sum+weight(key),0);
      const index=pool.findIndex(key=>(roll-=weight(key))<0);
      choices.push(pool.splice(index,1)[0]);
    }
    b.pve.choices[p.id]=choices; b.pve.choiceIds[p.id]=b.pve.nextChoiceId++;
  }
  function addExperience(b,amount,allRewards) {
    if(b.status!=="playing" || b.pve.level>=20)return;
    b.pve.xp+=amount;
    while(b.pve.level<20 && b.pve.xp>=xpNeeded(b.pve.level)) {
      b.pve.xp-=xpNeeded(b.pve.level);b.pve.level++;
      for(const p of b.entities.filter(e=>e.tankType!=="zombie" && !e.forfeited)) {
        b.pve.pending[p.id]++;offer(b,p,allRewards);
      }
    }
    if(b.pve.level===20)b.pve.xp=0;
  }
  function complete(b,p,allRewards) {
    b.pve.pending[p.id]--;delete b.pve.choices[p.id];delete b.pve.choiceIds[p.id];
    offer(b,p,allRewards);
  }
  function visible(b,from,to) { return !b.collision(from,to,null,{bodies:false}); }
  function nearby(b,from,radius,exclude=[]) {
    return enemies(b).filter(e=>!exclude.includes(e.id) && Math.hypot(e.x-from.x,e.y+1.5-from.y,e.z-from.z)<=radius && visible(b,from,point(e)))
      .sort((a,c)=>Math.hypot(a.x-from.x,a.z-from.z)-Math.hypot(c.x-from.x,c.z-from.z)||a.id.localeCompare(c.id));
  }
  function arc(b,owner,from,target,damage) {
    const to=point(target),applied=b.damage(target,damage,owner,to);
    if(applied)b.emit("beam",{id:owner,from,to,radius:0.1,power:0.5});
    return applied;
  }
  function burst(b,owner,from,radius,damage,exclude=[]) {
    const targets=nearby(b,from,radius,exclude);
    b.emit("explosion",{owner,x:from.x,y:from.y,z:from.z,radius});
    for(const target of targets)b.damage(target,damage,owner,point(target));
    return targets;
  }
  function onDeath(b,target,owner,allRewards) {
    if(target.tankType!=="zombie")return;
    M.onDeath(b,target,owner);
    if(["boss","titan"].includes(target.zombieType)) {
      b.pve.boss.telegraph=null;
      if(target.zombieType==="titan")b.pve.boss.defeated=true;
      else b.pve.boss.spawned=false;
      return;
    }
    addExperience(b,{walker:10,cone:15,runner:12,bucket:25,brute:40}[target.zombieType]||10,allRewards);
    const budget=b.pveChainBudget;
    if(b.pve.upgrades[owner]?.chain && b.getEntity(owner)?.weaponType==="rocket" &&
      !b.resolvingPveBurst && !b.moduleSecondary && budget?.owner===owner && budget.remaining>0 && b.pve.bursts.length<16) {
      budget.remaining--;
      b.pve.bursts.push({kind:"chain",at:b.tick+1,owner,...point(target),radius:6,damage:80});
    }
  }
  function onHit(b,hit,shot,before) {
    const u=b.pve.upgrades[shot.owner],target=b.getEntity(hit.id),owner=b.getEntity(shot.owner),from=hit.point;
    if(!u||!target||!owner)return;
    M.onHit(b,hit,shot,before);
    if(owner.weaponType!==shot.weaponType)return;
    if(shot.weaponType==="pistol") {
      const excluded=[hit.id];
      if(u.pierce) {
        const end={x:from.x+shot.dx*15,y:from.y+shot.dy*15,z:from.z+shot.dz*15};
        for(let i=0;i<3;i++) {
          const next=b.collision(from,end,shot.owner,{ignoreIds:excluded});
          if(next?.kind!=="tank")break;
          const pierced=b.getEntity(next.id);if(!pierced)break;
          arc(b,shot.owner,from,pierced,20);excluded.push(pierced.id);
        }
      }
      if(u.ricochet)for(const ricochet of nearby(b,from,10,excluded).slice(0,2)) {
        arc(b,shot.owner,from,ricochet,20);excluded.push(ricochet.id);
      }
      b.pve.hits[shot.owner]=(b.pve.hits[shot.owner]+1)%2;
      if(u.lightning&&!b.pve.hits[shot.owner]) {
        const limit=u.conductor?10:5;
        for(const shocked of nearby(b,from,12,[hit.id]).slice(0,limit))arc(b,shot.owner,from,shocked,35);
      }
      if(u.thunder&&shot.magazineFinal&&!shot.pveThunder) {
        shot.pveThunder=true;
        if(burst(b,shot.owner,point(target),8,120).length>=5) {
          owner.ammo=C.WEAPONS.pistol.magazineSize;owner.cooldown=0;
        }
      }
    } else if(shot.weaponType==="standard"&&shot.critical) {
      const epic=u.judgment,origin=point(target);
      if(epic)burst(b,shot.owner,origin,10,150);
      else if(u.earthquake)burst(b,shot.owner,origin,8,100,[target.id]);
      else if(u.heavyShell)burst(b,shot.owner,origin,6,60,[target.id]);
      if(u.earthquake&&b.pve.bursts.length<16)
        b.pve.bursts.push({kind:"quake",at:b.tick+30,owner:shot.owner,...origin,radius:8,damage:60});
      if(u.execution&&target.alive&&["brute","boss","titan"].includes(target.zombieType))
        b.damage(target,epic?150:100,shot.owner,origin);
      if(u.penetrator) {
        const excluded=[hit.id],end={x:from.x+shot.dx*30,y:from.y+shot.dy*30,z:from.z+shot.dz*30};
        for(let i=0;i<2;i++) {
          const next=b.collision(from,end,shot.owner,{ignoreIds:excluded});
          if(next?.kind!=="tank")break;
          const pierced=b.getEntity(next.id);if(!pierced)break;
          arc(b,shot.owner,from,pierced,shot.damage);excluded.push(pierced.id);
        }
      }
    } else if(shot.weaponType==="rapid") {
      const wasSlowed=target.slowUntil>b.tick;
      if(u.suppression)target.slowUntil=Math.max(target.slowUntil,b.tick+180);
      if(u.crossfire)for(const side of nearby(b,from,8,[target.id]).slice(0,u.multiCross?3:1))
        arc(b,shot.owner,from,side,u.multiCross?15:10);
      if(u.rupture&&wasSlowed&&target.alive)b.damage(target,8,shot.owner,point(target));
      if(u.metalStorm) {
        b.pve.rapidHits[shot.owner]=(b.pve.rapidHits[shot.owner]+1)%5;
        if(!b.pve.rapidHits[shot.owner])for(const tracked of nearby(b,from,12,[target.id]).slice(0,8))
          arc(b,shot.owner,from,tracked,30);
      }
    } else if(shot.weaponType==="laser") {
      if(u.plasmaBurst&&(shot.pvePlasmaBursts||0)<3) {
        const first=!shot.pvePlasmaBursts,radius=u.stellar&&first?8:4,damage=u.stellar&&first?120:60;
        shot.pvePlasmaBursts=(shot.pvePlasmaBursts||0)+1;
        const excluded=[...(shot.rayTargetIds||[target.id]),...(shot.pvePlasmaVictims||[])],
          struck=burst(b,shot.owner,point(target),radius,damage,excluded);
        shot.pvePlasmaVictims=[...(shot.pvePlasmaVictims||[]),...struck.map(e=>e.id)];
      }
      if(u.refraction&&!shot.pveRefraction) {
        shot.pveRefraction=true;
        for(const refracted of nearby(b,from,12,shot.rayTargetIds||[target.id]).slice(0,u.stellar?6:4))
          arc(b,shot.owner,from,refracted,100);
      }
    }
  }
  function fireZone(b,hit,shot) {
    const u=b.pve.upgrades[shot.owner],owner=b.getEntity(shot.owner);
    if(!u||shot.weaponType!=="rocket"||owner?.weaponType!=="rocket")return;
    if(u.fire) {
      if(b.pve.hazards.length>=12)b.pve.hazards.shift();
      const nuclear=u.doomsday&&shot.doomsday;
      b.pve.hazards.push({id:b.pve.nextHazard++,owner:shot.owner,x:hit.point.x-shot.dx*.04,
        y:(b.map.levels.filter(level=>level.y<=hit.point.y+.05).at(-1)?.y||0)+.15,z:hit.point.z-shot.dz*.04,
        radius:nuclear?8:5,damage:nuclear?20:15,until:b.tick+(nuclear?300:240),nextTick:b.tick+30});
    }
    if(u.cluster) {
      const counts=new Map(),center=hit.point;
      for(let i=0;i<5;i++) {
        const angle=(shot.id%17+i)*Math.PI*2/5,p={x:center.x+Math.cos(angle)*5,y:center.y,z:center.z+Math.sin(angle)*5};
        b.emit("explosion",{owner:shot.owner,...p,radius:4});
        for(const z of nearby(b,p,4))if((counts.get(z.id)||0)<2) {
          counts.set(z.id,(counts.get(z.id)||0)+1);b.damage(z,50,shot.owner,point(z));
        }
      }
    }
  }
  function tick(b) {
    M.tick(b);
    for(const zone of b.pve.hazards)if(b.tick>=zone.nextTick&&b.tick<=zone.until) {
      zone.nextTick=b.tick+30;
      const from={x:zone.x,y:zone.y+1.35,z:zone.z},budget={owner:zone.owner,remaining:3};
      b.pveChainBudget=budget;
      for(const z of enemies(b))
        if(Math.abs(z.y+.15-zone.y)<2&&Math.hypot(z.x-zone.x,z.z-zone.z)<=zone.radius&&visible(b,from,point(z)))
          b.damage(z,zone.damage,zone.owner,point(z));
      if(b.pveChainBudget===budget)b.pveChainBudget=null;
    }
    b.pve.hazards=b.pve.hazards.filter(h=>h.until>b.tick);
    const jobs=b.pve.bursts.filter(job=>job.at<=b.tick).slice(0,16),due=new Set(jobs);
    b.pve.bursts=b.pve.bursts.filter(job=>!due.has(job));b.resolvingPveBurst=true;
    try {for(const job of jobs)burst(b,job.owner,job,job.radius,job.damage);} finally {b.resolvingPveBurst=false;}
  }
  function bossAttack(b) {
    const state=b.pve.boss, boss=b.entities.find(e=>["boss","titan"].includes(e.zombieType)&&e.alive);
    if(!boss || state.defeated)return;
    const enraged=boss.hp<boss.maxHp/2, final=boss.zombieType==="titan",
      attack=final
        ? {warning:75,radius:enraged?11:9,lead:enraged?1.25:1,damage:enraged?70:60,wait:enraged?90:150}
        : {warning:60,radius:enraged?7:6,lead:enraged?1:.75,damage:enraged?50:45,wait:enraged?120:180};
    if(state.telegraph && b.tick>=state.telegraph.at) {
      const hitPlayers = new Set();
      for(const zone of state.telegraph.zones) {
        b.emit("explosion",{owner:boss.id,...zone});
        for(const p of b.entities.filter(e=>e.tankType!=="zombie" && e.alive))
          if(!hitPlayers.has(p.id) && Math.abs(p.y-zone.y)<2 && Math.hypot(p.x-zone.x,p.z-zone.z)<zone.radius) {
            b.damage(p,attack.damage,boss.id,point(p));hitPlayers.add(p.id);
          }
      }
      state.telegraph=null;state.nextAttackAt=b.tick+attack.wait;
    } else if(!state.telegraph && b.tick>=state.nextAttackAt) {
      state.telegraph={at:b.tick+attack.warning,zones:b.entities.filter(e=>e.tankType!=="zombie" && e.alive).map(e=>{
        const projected={...e,brain:e.brain},steps=Math.max(1,Math.round(attack.lead*C.TICK_RATE)),
          groundBound=b.map.levels[0].bound-C.TANKS[e.tankType].radius;
        for(let i=0;i<steps;i++) {
          if(projected.falling) {
            projected.x=C.clamp(projected.x+projected.fallVX*C.DT,-groundBound,groundBound);
            projected.z=C.clamp(projected.z+projected.fallVZ*C.DT,-groundBound,groundBound);
            projected.fallVelocity=Math.max(-C.RULES.terminalFallSpeed,
              projected.fallVelocity-C.RULES.gravity*C.DT);
            const y=projected.y+projected.fallVelocity*C.DT,
              landing=b.map.levels.filter(level=>level.y<=projected.y&&level.y>=y&&
                C.deckRects(b.map,level).some(q=>projected.x>=q.x0&&projected.x<=q.x1&&
                  projected.z>=q.z0&&projected.z<=q.z1)).sort((a,c)=>c.y-a.y)[0];
            if(landing)Object.assign(projected,{y:landing.y,floor:landing.id,falling:false,
              fallVelocity:0,fallVX:0,fallVZ:0,rampId:null,rampDir:0,speed:projected.speed*.35});
            else projected.y=y;
            continue;
          }
          const x=projected.x-Math.cos(projected.heading)*projected.speed*C.DT,
            z=projected.z+Math.sin(projected.heading)*projected.speed*C.DT,
            surface=b.surface(projected,x,z);
          if(!surface||!b.valid(x,z,surface.floor,projected,
            {surface,allowDrop:true,ignoreEntities:true}))break;
          if(surface.falling)Object.assign(projected,{fallVelocity:0,
            fallVX:-Math.cos(projected.heading)*projected.speed,
            fallVZ:Math.sin(projected.heading)*projected.speed});
          Object.assign(projected,{x,z,...surface});
        }
        return {x:projected.x,y:projected.y,z:projected.z,radius:attack.radius};
      })};
      boss.boostUntil=b.tick+(final?90:120);
    }
  }
  function validate(s) {
    const v=s.pve, players=s.entities.filter(e=>e.tankType!=="zombie"), ids=new Set(players.map(e=>e.id)), map=C.mapForMode(s.mode);
    const int=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
    const object=o=>o && typeof o==="object"&&!Array.isArray(o);
    const pos=o=>object(o)&&['x','y','z'].every(k=>Number.isFinite(o[k])&&Math.abs(o[k])<=(k==='y'?map.levels.at(-1).y+4:map.worldLimit));
    if(!int(v.level,20)||v.level<1||!int(v.xp,xpNeeded(v.level)-1)||!int(v.rng,4294967295)||!v.rng||
       !int(v.nextChoiceId)||!object(v.pending)||!object(v.choiceIds)||!object(v.hits)||
       !object(v.rapidHits)||!object(v.rocketShots)||!int(v.nextHazard)||
       !Array.isArray(v.hazards)||v.hazards.length>12||!Array.isArray(v.bursts)||v.bursts.length>16)throw Error('Invalid run progression');
    for(const table of [v.pending,v.hits,v.rapidHits,v.rocketShots])if(Object.keys(table).length!==players.length||Object.keys(table).some(id=>!ids.has(id)))throw Error('Invalid run owners');
    for(const p of players) {
      const u=v.upgrades[p.id];
      if(!object(u)||Object.keys(u).length!==Object.keys(caps).length||Object.entries(caps).some(([k,max])=>!int(u[k],max))||
         Object.entries(rewards).some(([key,r])=>r.requires&&u[key]>0&&!u[r.requires])||
         !int(v.pending[p.id],19)||!int(v.hits[p.id],1)||!int(v.rapidHits[p.id],4)||!int(v.rocketShots[p.id],2))throw Error('Invalid run upgrade');
      if(Boolean(v.choices[p.id])!==Boolean(v.pending[p.id]) && !p.forfeited && s.status!=="finished")throw Error('Missing reward');
    }
    if(Object.keys(v.choiceIds).length!==Object.keys(v.choices).length)throw Error('Invalid reward identifiers');
    for(const id of Object.keys(v.choices))if(!int(v.choiceIds[id])||v.choiceIds[id]>=v.nextChoiceId)throw Error('Invalid reward identifier');
    for(const h of v.hazards)if(!pos(h)||!ids.has(h.owner)||!int(h.id)||!int(h.until)||!int(h.nextTick)||
      ![[5,15],[8,20]].some(([r,d])=>h.radius===r&&h.damage===d)||h.nextTick<=s.tick||h.nextTick>h.until||h.until>s.tick+300)
      throw Error('Invalid fire zone');
    for(const h of v.bursts)if(!pos(h)||!ids.has(h.owner)||!['chain','quake'].includes(h.kind)||!int(h.at)||h.at<=s.tick||
      (h.kind==='chain'&&(h.radius!==6||h.damage!==80||h.at>s.tick+1))||
      (h.kind==='quake'&&(h.radius!==8||h.damage!==60||h.at>s.tick+30)))throw Error('Invalid burst');
    const boss=v.boss;
    if(!object(boss)||!int(boss.stage,2)||typeof boss.spawned!=="boolean"||typeof boss.defeated!=="boolean"||!int(boss.nextAttackAt)||
      (boss.stage===0&&(boss.spawned||boss.defeated))||(boss.stage===1&&boss.defeated)||
      (boss.stage===2&&!boss.spawned)||(boss.defeated&&boss.stage!==2)||
      (v.wave>=8)!==(boss.stage>=1)||(v.wave>=16)!==(boss.stage===2))throw Error('Invalid boss');
    const expectedRadius=boss.stage===2?[9,11]:[6,7];
    if(boss.telegraph!==null && (!boss.spawned||!object(boss.telegraph)||!int(boss.telegraph.at)||!Array.isArray(boss.telegraph.zones)||
      boss.telegraph.zones.length>8||!boss.telegraph.zones.every(z=>pos(z)&&expectedRadius.includes(z.radius))))throw Error('Invalid boss warning');
    const bosses = s.entities.filter(e=>["boss","titan"].includes(e.zombieType)),
      active = bosses.filter(e=>e.alive);
    if(active.length!==(boss.spawned&&!boss.defeated?1:0)||active.some(e=>e.zombieType!==(boss.stage===1?"boss":"titan"))||
      (boss.stage===1&&boss.spawned&&v.wave!==8)||
      (boss.stage===1&&!boss.spawned&&!bosses.some(e=>e.zombieType==="boss"&&!e.alive))||
      (boss.defeated&&!bosses.some(e=>e.zombieType==="titan"&&!e.alive)))throw Error("Inconsistent boss state");
    if(s.entities.some(e=>e.tankType==="zombie"&&!int(e.slowUntil)))throw Error('Invalid slow status');
    M.validate(s);
  }
  return Object.freeze({rewards,caps,xpNeeded,initialize,offer,addExperience,complete,onDeath,onHit,moduleDamage:M.directDamage,fireZone,tick,bossAttack,validate});
});
