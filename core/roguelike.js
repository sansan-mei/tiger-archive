/* Authoritative run progression and bounded skill effects. No recursive explosions. */
(function(root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./content.js") : root.TankContent);
  if (node) module.exports = api; else (root.TankSystems ??= {}).roguelike = api;
})(typeof window === "undefined" ? globalThis : window, function(C) {
  "use strict";
  const rewards = Object.freeze({
    pistol: { name: "换装小手枪", description: "切换至小手枪，搭配穿透、弹射和闪电" },
    pierce: { name: "贯穿弹", description: "手枪命中后穿透至前方 12 米内另一名敌人", weapon: "pistol" },
    ricochet: { name: "弹射弹", description: "手枪额外弹射至 7 米内另一敌人，造成 15 伤害", requires: "pierce", weapon: "pistol" },
    lightning: { name: "雷电弹匣", description: "每 3 次手枪命中，对附近最多 3 名敌人各造成 20 电击", requires: "ricochet", weapon: "pistol" },
    heavyShell: { name: "震荡重弹", description: "标准炮暴击在命中点震荡 4 米，对附近敌人造成 30 伤害", weapon: "standard" },
    execution: { name: "处决弹", description: "标准炮暴击对巨型与 Boss 感染者追加 60 伤害", requires: "heavyShell", weapon: "standard" },
    suppression: { name: "压制弹链", description: "快速炮命中使感染者减速 45%，持续 2 秒", weapon: "rapid" },
    crossfire: { name: "交叉火力", description: "快速炮命中后对 6 米内另一敌人追加 10 伤害", requires: "suppression", weapon: "rapid" },
    wideBeam: { name: "广角透镜", description: "激光束半径从 0.45 米提升至 0.75 米", weapon: "laser" },
    plasmaBurst: { name: "等离子爆发", description: "激光每次发射首次命中时，对目标周围 3 米敌人造成 25 伤害", requires: "wideBeam", weapon: "laser" },
    blast: { name: "扩爆弹头", description: "火箭爆炸半径 +1 米，最多 3 级", weapon: "rocket" },
    fire: { name: "燃烧弹头", description: "火箭留下 3 秒燃烧区，每半秒造成 8 伤害", requires: "blast", weapon: "rocket" },
    chain: { name: "连锁殉爆", description: "击杀感染者触发 4 米、35 伤害次爆；次爆不会继续引爆", requires: "fire", weapon: "rocket" },
    novaRange: { name: "广域脉冲", description: "脉冲半径 +1.5 米，最多 3 级", requires: "nova" },
    frost: { name: "寒霜脉冲", description: "脉冲使命中敌人减速 45%，持续 5 秒", requires: "novaRange" },
    shatter: { name: "碎冰共振", description: "脉冲对已减速的敌人造成双倍伤害", requires: "frost" },
  });
  const caps = Object.freeze({ haste:3, regen:3, nova:3, pierce:1, ricochet:1, lightning:1,
    heavyShell:1, execution:1, suppression:1, crossfire:1, wideBeam:1, plasmaBurst:1,
    blast:3, fire:1, chain:1, novaRange:3, frost:1, shatter:1 });
  const xpNeeded = level => 40 + (level - 1) * 20;
  const point = e => ({x:e.x,y:e.y+1.5,z:e.z});
  const enemies = b => b.entities.filter(e => e.tankType === "zombie" && e.alive);
  function initialize(b) {
    let seed = 2166136261;
    for (const ch of b.matchId + ":" + b.epoch) seed = Math.imul(seed ^ ch.charCodeAt(0), 16777619) >>> 0;
    Object.assign(b.pve, { level:1, xp:0, rng:seed || 1, pending:{}, choiceIds:{}, nextChoiceId:1, hits:{}, hazards:[], bursts:[], nextHazard:1,
      boss:{ stage:0, spawned:false, defeated:false, nextAttackAt:0, telegraph:null } });
    for (const p of b.entities.filter(e=>e.tankType!=="zombie")) {
      b.pve.upgrades[p.id] = Object.fromEntries(Object.keys(caps).map(k=>[k,0]));
      b.pve.pending[p.id]=0; b.pve.hits[p.id]=0;
    }
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
    for(let i=pool.length-1;i>0;i--){const j=Math.floor(random(b)*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
    // At least one eligible evolution for the equipped weapon or pulse build.
    const preferred=pool.find(k=>rewards[k]?.weapon===p.weaponType || (!rewards[k]?.weapon && rewards[k]?.requires));
    if(preferred){pool.splice(pool.indexOf(preferred),1);pool.unshift(preferred);}
    b.pve.choices[p.id]=pool.slice(0,3); b.pve.choiceIds[p.id]=b.pve.nextChoiceId++;
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
    b.damage(target,damage,owner,point(target));
    b.emit("beam",{id:owner,from,to:point(target),radius:0.1,power:0.5});
  }
  function burst(b,owner,from,radius,damage,exclude=[]) {
    b.emit("explosion",{owner,...from,radius});
    for(const target of nearby(b,from,radius,exclude))b.damage(target,damage,owner,point(target));
  }
  function onDeath(b,target,owner,allRewards) {
    if(target.tankType!=="zombie")return;
    if(["boss","titan"].includes(target.zombieType)) {
      b.pve.boss.telegraph=null;
      if(target.zombieType==="titan")b.pve.boss.defeated=true;
      else b.pve.boss.spawned=false;
      return;
    }
    addExperience(b,{walker:10,cone:15,runner:12,bucket:25,brute:40}[target.zombieType]||10,allRewards);
    if(b.pve.upgrades[owner]?.chain && b.getEntity(owner)?.weaponType==="rocket" &&
      !b.resolvingPveBurst && b.pve.bursts.length<16)b.pve.bursts.push({owner,...point(target)});
  }
  function onHit(b,hit,shot) {
    const u=b.pve.upgrades[shot.owner],target=b.getEntity(hit.id),owner=b.getEntity(shot.owner),from=hit.point;
    if(!u||!target||!owner||owner.weaponType!==shot.weaponType)return;
    if(shot.weaponType==="pistol") {
      const excluded=[hit.id];
      if(u.pierce) {
        const end={x:from.x+shot.dx*12,y:from.y+shot.dy*12,z:from.z+shot.dz*12};
        const next=b.collision(from,end,shot.owner,{ignoreIds:excluded});
        if(next?.kind==="tank") { const pierced=b.getEntity(next.id);arc(b,shot.owner,from,pierced,20);excluded.push(pierced.id); }
      }
      if(u.ricochet) {const ricochet=nearby(b,from,7,excluded)[0];if(ricochet){arc(b,shot.owner,from,ricochet,15);excluded.push(ricochet.id);}}
      b.pve.hits[shot.owner]=(b.pve.hits[shot.owner]+1)%3;
      if(u.lightning && !b.pve.hits[shot.owner])for(const shocked of nearby(b,from,12,[hit.id]).slice(0,3))arc(b,shot.owner,from,shocked,20);
    } else if(shot.weaponType==="standard" && shot.critical) {
      if(u.heavyShell)burst(b,shot.owner,point(target),4,30,[target.id]);
      if(u.execution && target.alive && ["brute","boss","titan"].includes(target.zombieType))
        b.damage(target,60,shot.owner,point(target));
    } else if(shot.weaponType==="rapid") {
      if(u.suppression)target.slowUntil=Math.max(target.slowUntil,b.tick+120);
      if(u.crossfire) {const side=nearby(b,from,6,[target.id])[0];if(side)arc(b,shot.owner,from,side,10);}
    } else if(shot.weaponType==="laser" && u.plasmaBurst && !shot.pvePlasmaBurst) {
      shot.pvePlasmaBurst=true;burst(b,shot.owner,point(target),3,25,[target.id]);
    }
  }
  function fireZone(b,hit,shot) {
    if(!b.pve.upgrades[shot.owner]?.fire || shot.weaponType!=="rocket" ||
      b.getEntity(shot.owner)?.weaponType!=="rocket")return;
    if(b.pve.hazards.length>=12)b.pve.hazards.shift();
    b.pve.hazards.push({id:b.pve.nextHazard++,owner:shot.owner,x:hit.point.x-shot.dx*.04,y:(b.map.levels.filter(level=>level.y<=hit.point.y+.05).at(-1)?.y || 0)+.15,z:hit.point.z-shot.dz*.04,
      radius:3,until:b.tick+180,nextTick:b.tick+30});
  }
  function tick(b) {
    for(const zone of b.pve.hazards) if(b.tick>=zone.nextTick && b.tick<=zone.until) {
      zone.nextTick=b.tick+30;
      const from = { x: zone.x, y: zone.y + 1.35, z: zone.z };
      for(const z of enemies(b))
        if (Math.abs(z.y + .15 - zone.y) < 2 && Math.hypot(z.x-zone.x,z.z-zone.z)<=zone.radius && visible(b,from,point(z)))
          b.damage(z,8,zone.owner,point(z));
    }
    b.pve.hazards=b.pve.hazards.filter(h=>h.until>b.tick);
    const jobs=b.pve.bursts.splice(0,16);b.resolvingPveBurst=true;
    try {for(const job of jobs) {
      b.emit("explosion",{owner:job.owner,x:job.x,y:job.y,z:job.z,radius:4});
      for(const z of nearby(b,job,4))b.damage(z,35,job.owner,point(z));
    }} finally {b.resolvingPveBurst=false;}
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
    const v=s.pve, players=s.entities.filter(e=>e.tankType!=="zombie"), ids=new Set(players.map(e=>e.id));
    const int=(n,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(n)&&n>=0&&n<=max;
    const object=o=>o && typeof o==="object"&&!Array.isArray(o);
    const pos=o=>object(o)&&['x','y','z'].every(k=>Number.isFinite(o[k])&&Math.abs(o[k])<=(k==='y'?90:C.MAP.worldLimit));
    if(!int(v.level,20)||v.level<1||!int(v.xp,xpNeeded(v.level)-1)||!int(v.rng,4294967295)||!v.rng||
       !int(v.nextChoiceId)||!object(v.pending)||!object(v.choiceIds)||!object(v.hits)||!int(v.nextHazard)||
       !Array.isArray(v.hazards)||v.hazards.length>12||!Array.isArray(v.bursts)||v.bursts.length>16)throw Error('Invalid run progression');
    for(const table of [v.pending,v.hits])if(Object.keys(table).length!==players.length||Object.keys(table).some(id=>!ids.has(id)))throw Error('Invalid run owners');
    for(const p of players) {
      const u=v.upgrades[p.id];
      if(!object(u)||Object.keys(u).length!==Object.keys(caps).length||Object.entries(caps).some(([k,max])=>!int(u[k],max))||
         Object.entries(rewards).some(([key,r])=>r.requires&&u[key]>0&&!u[r.requires])||
         !int(v.pending[p.id],19)||!int(v.hits[p.id],2))throw Error('Invalid run upgrade');
      if(Boolean(v.choices[p.id])!==Boolean(v.pending[p.id]) && !p.forfeited && s.status!=="finished")throw Error('Missing reward');
    }
    if(Object.keys(v.choiceIds).length!==Object.keys(v.choices).length)throw Error('Invalid reward identifiers');
    for(const id of Object.keys(v.choices))if(!int(v.choiceIds[id])||v.choiceIds[id]>=v.nextChoiceId)throw Error('Invalid reward identifier');
    for(const h of v.hazards)if(!pos(h)||!ids.has(h.owner)||!int(h.id)||!int(h.until)||!int(h.nextTick)||h.radius!==3)throw Error('Invalid fire zone');
    for(const h of v.bursts)if(!pos(h)||!ids.has(h.owner))throw Error('Invalid burst');
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
      (boss.defeated&&!bosses.some(e=>e.zombieType==="titan"&&!e.alive)))throw Error("Inconsistent boss state");
    if(s.entities.some(e=>e.tankType==="zombie"&&!int(e.slowUntil)))throw Error('Invalid slow status');
  }
  return Object.freeze({rewards,caps,xpNeeded,initialize,offer,addExperience,complete,onDeath,onHit,fireZone,tick,bossAttack,validate});
});
