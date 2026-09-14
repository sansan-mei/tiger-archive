/* Alternate weapon routes. All timers and bounded effects are checkpointed by the authority. */
(function(root,factory) {
  const node=typeof module==='object'&&module.exports;
  const api=factory(node?require('./content.js'):root.TankContent);
  if(node)module.exports=api;else(root.TankSystems??={}).branches=api;
})(typeof window==='undefined'?globalThis:window,function(C) {
  'use strict';
  const routes=[
    {weapon:'pistol',shared:'pierce',label:'雷电流',keys:['ricochet','lightning','conductor','thunder']},
    {weapon:'pistol',shared:'pierce',label:'快装流',keys:['lightMagazine','doubleTap','refundRound','openingForever']},
    {weapon:'standard',shared:'heavyShell',label:'重炮流',keys:['execution','penetrator','earthquake','judgment']},
    {weapon:'standard',shared:'heavyShell',label:'霰弹流',keys:['shrapnel','fanShot','breach','siegeScatter']},
    {weapon:'rapid',shared:'suppression',label:'压制流',keys:['crossfire','multiCross','rupture','metalStorm']},
    {weapon:'rapid',shared:'suppression',label:'架枪流',keys:['bipod','piercingBelt','guardPlate','fortress']},
    {weapon:'laser',shared:'wideBeam',label:'光棱流',keys:['capacitor','plasmaBurst','refraction','stellar']},
    {weapon:'laser',shared:'wideBeam',label:'蓄能流',keys:['chargeCore','hotTrail','energyReturn','starfall']},
    {weapon:'rocket',shared:'blast',label:'核爆流',keys:['fire','chain','cluster','doomsday']},
    {weapon:'rocket',shared:'blast',label:'燃烧流',keys:['napalm','embers','scorch','inferno']},
  ].map(r=>Object.freeze({...r,keys:Object.freeze(r.keys)}));
  const descriptions={
    lightMagazine:['轻型弹匣','4 发弹匣，0.75 秒装填；每次装填后前两发伤害提高 50%'],
    doubleTap:['双响快射','强化弹额外攻击 10 米内另一名敌人，造成 25 伤害'],
    refundRound:['击杀续杯','强化弹直接击杀返还一发强化弹，每次装填最多两次'],
    openingForever:['无限开场','装填后 2 秒内每发均强化并触发双响；强化弹直接击杀延长 0.25 秒，每轮最多 3 秒'],
    shrapnel:['破片炮膛','主炮外追加 3 枚扇形破片，射程 12 米，每枚 20 伤害'],
    fanShot:['扇面扫荡','破片增加至 5 枚，扩大扇形覆盖；同一目标最多承受 3 枚'],
    breach:['近距破阵','破片击退 6 米内敌人；同次射击命中两枚破片追加一次 30 伤害，Boss 不被击退'],
    siegeScatter:['攻城霰炮','每第 3 炮破片伤害提高至 35，每枚额外贯穿一名敌人'],
    bipod:['稳定支架','站定持续开火 1.5 秒，射速逐步提高至两倍；跑动迅速失去加成'],
    piercingBelt:['穿甲弹链','完全展开后，直接命中额外贯穿后方一名敌人，造成 15 伤害'],
    guardPlate:['应急护板','完全展开获得 25 点护盾，持续 3 秒，冷却 10 秒'],
    fortress:['移动堡垒','完全展开追加两路侧向火力，各 12 伤害；开火时按住 C 或缓行按钮可缓慢移动并保持展开'],
    chargeCore:['蓄能核心','按住蓄力、松开发射，2 秒蓄满造成 240 伤害；点射造成 60 伤害'],
    hotTrail:['灼热轨迹','满蓄力留下 3 秒灼烧带，每半秒 20 伤害'],
    energyReturn:['能量回收','满蓄力命中至少 3 名敌人，下一次蓄力缩短至 1.2 秒'],
    starfall:['天际贯星','满蓄力射击后，0.5 秒沿原路径追加一次更宽的 120 伤害扫射'],
    napalm:['凝固燃料','火箭直击与爆炸伤害降低 40%；留下 6 秒火区，每半秒 20 伤害'],
    embers:['余火蔓延','火区内敌人被烧死时留下 3 米小火区，持续 3 秒；小火区不再扩散'],
    scorch:['焦土升温','同一火区连续灼烧的伤害逐次增加 5，最高每半秒 40；离开后重置'],
    inferno:['焚城','每第 3 发留下 8 米火场，并将附近火区续至剩余 6 秒'],
  };
  const rewards={};
  for(const r of routes)for(const [i,key] of r.keys.entries())if(descriptions[key])
    rewards[key]={name:descriptions[key][0],description:descriptions[key][1],weapon:r.weapon,requires:i?r.keys[i-1]:r.shared};
  const caps=Object.fromEntries(Object.keys(rewards).map(key=>[key,1]));
  const routeFor=key=>routes.find(r=>r.keys.includes(key));
  function allowed(upgrades,key) {
    const route=routeFor(key);
    return !route||!routes.some(r=>r.weapon===route.weapon&&r!==route&&r.keys.some(k=>upgrades[k]>0));
  }
  const fresh=life=>({life,bonus:0,refunds:0,burstUntil:0,burstCap:0,deploy:0,guard:0,guardUntil:0,guardReady:0,shots:0,chargeReady:0});
  function initialize(b) {
    b.pve.branchState=Object.fromEntries(b.entities.filter(e=>e.tankType!=='zombie').map(p=>[p.id,fresh(p.deaths)]));
    b.pve.branchZones=[];b.pve.branchEchoes=[];b.pve.nextBranchZone=1;
  }
  function reset(b,p) {
    const previous=b.pve.branchState[p.id];
    // Switching weapons must not bypass the shield cooldown.
    b.pve.branchState[p.id]={...fresh(p.deaths),guardReady:previous?.guardReady||0};
    b.pve.branchZones=b.pve.branchZones.filter(area=>area.owner!==p.id);
    b.pve.branchEchoes=b.pve.branchEchoes.filter(job=>job.owner!==p.id);
  }
  function weapon(b,p) {
    const base=C.WEAPONS[p.weaponType],u=b.pve?.upgrades[p.id],s=b.pve?.branchState?.[p.id];
    if(!u||!s)return base;
    if(p.weaponType==='pistol'&&u.lightMagazine)return {...base,magazineSize:4,reloadTicks:45};
    if(p.weaponType==='rapid'&&u.bipod)return {...base,cooldown:Math.max(1,Math.round(base.cooldown/(1+s.deploy/90)))};
    if(p.weaponType==='laser'&&u.chargeCore)return {...base,trigger:'release',charge:s.chargeReady?72:120,damage:240,minPower:.25};
    return base;
  }
  function reload(b,p) {
    const u=b.pve.upgrades[p.id],s=b.pve.branchState[p.id];
    if(p.weaponType!=='pistol'||!u.lightMagazine)return;
    s.bonus=2;s.refunds=0;s.burstUntil=u.openingForever?b.tick+120:0;s.burstCap=u.openingForever?b.tick+180:0;
  }
  function move(b,p,input) {
    const u=b.pve.upgrades[p.id],s=b.pve.branchState[p.id];
    if(!s)return;
    if(s.life!==p.deaths){reset(b,p);return;}
    const moving=input.forward||input.reverse||input.left||input.right;
    const crawling=u.fortress&&s.deploy===90&&input.brake&&input.fire&&!input.ability;
    const active=p.weaponType==='rapid'&&u.bipod&&input.fire&&!input.cancelFire&&!p.falling;
    s.deploy=active&&(!moving&&Math.abs(p.speed)<.3||crawling)?Math.min(90,s.deploy+1):Math.max(0,s.deploy-6);
    if(s.guardUntil<=b.tick)s.guard=0;
    if(active&&s.deploy===90&&u.guardPlate&&b.tick>=s.guardReady) {
      s.guard=25;s.guardUntil=b.tick+180;s.guardReady=b.tick+600;
    }
  }
  function secondaryDamage(b,target,amount,owner,at) {
    const previous=b.moduleSecondary;b.moduleSecondary=true;
    try{return b.damage(target,amount,owner,at);}finally{b.moduleSecondary=previous;}
  }
  const point=p=>({x:p.x,y:p.y+1.5,z:p.z});
  function ray(b,owner,from,to,damage,radius=0.15,limit=1,counts=null,perTarget=3,exclude=[]) {
    const ignored=[...exclude],targets=[];let drawEnd=to;
    for(let i=0;i<limit;i++) {
      const hit=b.collision(from,to,owner.id,{radius,floorRadius:Math.min(radius,.5),ignoreIds:ignored});
      if(!hit||hit.kind!=='tank'){if(hit)drawEnd=hit.point;break;}
      ignored.push(hit.id);
      const target=b.getEntity(hit.id);
      if(target?.tankType==='zombie'&&(!counts||(counts.get(target.id)||0)<perTarget)) {
        if(secondaryDamage(b,target,damage,owner.id,hit.point)) {
          targets.push(target);if(counts)counts.set(target.id,(counts.get(target.id)||0)+1);
        }
      }
    }
    b.emit('beam',{id:owner.id,from,to:drawEnd,radius,power:.5});
    return targets;
  }
  function zone(b,p,from,to,radius,damage,duration,spread=false) {
    if(b.pve.branchZones.length>=24)b.pve.branchZones.shift();
    b.pve.branchZones.push({id:b.pve.nextBranchZone++,owner:p.id,life:p.deaths,weapon:p.weaponType,
      from:{...from},to:{...to},radius,damage,until:b.tick+duration,nextTick:b.tick+30,spread,stacks:{}});
  }
  function prepare(b,p,shot) {
    const u=b.pve.upgrades[p.id],s=b.pve.branchState[p.id];
    if(p.weaponType==='pistol'&&u.lightMagazine) {
      shot.magazineFinal=false;
      shot.branchBoost=s.bonus>0||s.burstUntil>b.tick;
      if(shot.branchBoost){shot.damage=Math.round(shot.damage*1.5);s.bonus=Math.max(0,s.bonus-1);}
    }
    if(p.weaponType==='rocket'&&u.napalm){shot.branchNapalm=true;shot.damage=Math.round(shot.damage*.6);shot.branchInferno=!!u.inferno&&(s.shots+1)%3===0;}
  }
  function hit(b,hit,shot,before) {
    const p=b.getEntity(shot.owner),target=b.getEntity(hit.id),u=b.pve.upgrades[shot.owner],s=b.pve.branchState[shot.owner];
    if(!p?.alive||p.deaths!==shot.ownerLife||p.weaponType!==shot.weaponType||!u||!target)return;
    if(shot.weaponType==='pistol'&&shot.branchBoost) {
      if(u.doubleTap) {
        const other=b.entities.filter(e=>e.tankType==='zombie'&&e.alive&&e.id!==hit.id&&Math.hypot(e.x-target.x,e.z-target.z)<=10)
          .sort((a,c)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(c.x-target.x,c.z-target.z)||a.id.localeCompare(c.id))
          .find(e=>!b.collision(hit.point,point(e),null,{bodies:false}));
        if(other){secondaryDamage(b,other,25,p.id,point(other));b.emit('beam',{id:p.id,from:hit.point,to:point(other),radius:.12,power:.6});}
      }
      if(before?.directKilled) {
        if(u.refundRound&&s.refunds<2){p.ammo=Math.min(4,p.ammo+1);s.bonus=Math.min(4,s.bonus+1);s.refunds++;if(p.cooldown>24)p.cooldown=24;}
        if(u.openingForever&&s.burstUntil>b.tick)s.burstUntil=Math.min(s.burstCap,s.burstUntil+15);
      }
    }
    if(shot.weaponType==='rapid'&&u.piercingBelt&&s.deploy===90) {
      ray(b,p,hit.point,{x:hit.point.x+shot.dx*12,y:hit.point.y+shot.dy*12,z:hit.point.z+shot.dz*12},15,.1,1,null,3,[target.id]);
    }
  }
  function afterShot(b,p,shot,start,end=null) {
    const u=b.pve.upgrades[p.id],s=b.pve.branchState[p.id];
    if(!u)return;
    s.shots=(s.shots+1)%3;
    if(p.weaponType==='standard'&&u.shrapnel) {
      const n=u.fanShot?5:3,counts=new Map(),targets=new Map(),epic=u.siegeScatter&&s.shots===0;
      for(let i=0;i<n;i++) {
        const angle=p.aim+(i-(n-1)/2)*.12,c=Math.cos(p.pitch),to={x:start.x-Math.cos(angle)*12*c,y:start.y+Math.sin(p.pitch)*12,z:start.z+Math.sin(angle)*12*c};
        for(const target of ray(b,p,start,to,epic?35:20,.25,epic?2:1,counts))targets.set(target.id,target);
      }
      if(u.breach)for(const [id,target] of targets) {
        if(counts.get(id)>=2)secondaryDamage(b,target,30,p.id,point(target));
        if(target.alive&&!['boss','titan'].includes(target.zombieType)&&Math.hypot(target.x-p.x,target.z-p.z)<=6) {
          const length=Math.max(.1,Math.hypot(target.x-p.x,target.z-p.z)),dx=(target.x-p.x)/length*.25,dz=(target.z-p.z)/length*.25;
          for(let i=0;i<6;i++){const x=target.x+dx,z=target.z+dz;if(!b.valid(x,z,target.floor,target))break;target.x=x;target.z=z;}
        }
      }
    }
    if(p.weaponType==='rapid'&&u.fortress&&s.deploy===90)for(const offset of [-.16,.16]) {
      const angle=p.aim+offset,c=Math.cos(p.pitch);
      ray(b,p,start,{x:start.x-Math.cos(angle)*24*c,y:start.y+Math.sin(p.pitch)*24,z:start.z+Math.sin(angle)*24*c},12);
    }
    if(p.weaponType==='laser'&&u.chargeCore) {
      s.chargeReady=0;
      if(shot.damage>=240&&end) {
        if(u.hotTrail) {
          const from={...start,y:p.y+1.5},to={...end,y:p.y+1.5},
            block=b.collision(from,to,p.id,{bodies:false,radius:1,floorRadius:.5});
          zone(b,p,from,block?block.point:to,1,20,180);
        }
        if(u.energyReturn&&shot.rayTargetIds.length>=3)s.chargeReady=1;
        if(u.starfall&&b.pve.branchEchoes.length<8)b.pve.branchEchoes.push({owner:p.id,life:p.deaths,from:{...start},to:{...end},at:b.tick+30});
      }
    }
  }
  function fireZone(b,hit,shot) {
    const p=b.getEntity(shot.owner),u=b.pve.upgrades[shot.owner],s=b.pve.branchState[shot.owner];
    if(!p?.alive||p.deaths!==shot.ownerLife||p.weaponType!=='rocket'||shot.weaponType!=='rocket'||!u.napalm)return;
    const from={x:hit.point.x-shot.dx*.04,y:p.y+1.5,z:hit.point.z-shot.dz*.04};
    // Shot ids are stored on the projectile because several rockets can be in flight.
    const epic=!!shot.branchInferno;
    if(epic)for(const area of b.pve.branchZones)if(area.owner===p.id&&area.weapon==='rocket'&&Math.hypot(area.from.x-from.x,area.from.z-from.z)<=12)area.until=b.tick+360;
    zone(b,p,from,from,epic?8:5,20,360,!!u.embers);
  }
  function tick(b) {
    const zones=b.pve.branchZones.slice();
    for(const area of zones) {
      const owner=b.getEntity(area.owner),u=b.pve.upgrades[area.owner];
      if(!owner?.alive||owner.deaths!==area.life||owner.weaponType!==area.weapon||b.tick>area.until)continue;
      if(b.tick<area.nextTick)continue;area.nextTick=b.tick+30;
      const dx=area.to.x-area.from.x,dy=area.to.y-area.from.y,dz=area.to.z-area.from.z,length=dx*dx+dy*dy+dz*dz,inside=new Set();
      for(const target of b.entities) {
        if(target.tankType!=='zombie'||!target.alive)continue;
        const pos=point(target),t=length?C.clamp(((pos.x-area.from.x)*dx+(pos.y-area.from.y)*dy+(pos.z-area.from.z)*dz)/length,0,1):0,
          near={x:area.from.x+t*dx,y:area.from.y+t*dy,z:area.from.z+t*dz};
        if(Math.hypot(pos.x-near.x,pos.y-near.y,pos.z-near.z)>area.radius||b.collision(near,pos,null,{bodies:false}))continue;
        inside.add(target.id);
        const stack=area.stacks[target.id]||0,damage=area.damage+(area.weapon==='rocket'&&u.scorch?Math.min(4,stack)*5:0);
        area.stacks[target.id]=Math.min(4,stack+1);
        secondaryDamage(b,target,damage,owner.id,pos);
        if(!target.alive){delete area.stacks[target.id];if(area.spread)zone(b,owner,pos,pos,3,15,180);}
      }
      for(const id of Object.keys(area.stacks))if(!inside.has(id))delete area.stacks[id];
    }
    b.pve.branchZones=b.pve.branchZones.filter(a=>a.until>b.tick&&b.getEntity(a.owner)?.alive&&b.getEntity(a.owner).deaths===a.life&&b.getEntity(a.owner).weaponType===a.weapon);
    const jobs=b.pve.branchEchoes.filter(job=>job.at<=b.tick);
    b.pve.branchEchoes=b.pve.branchEchoes.filter(job=>job.at>b.tick);
    for(const job of jobs){const p=b.getEntity(job.owner);if(p?.alive&&p.deaths===job.life&&p.weaponType==='laser')ray(b,p,job.from,job.to,120,1.5,33);}
  }
  function death(b,target) {
    if(target.tankType!=='zombie'){reset(b,target);return;}
    for(const area of b.pve.branchZones)delete area.stacks[target.id];
  }
  function validate(b) {
    const p=b.pve,players=b.entities.filter(e=>e.tankType!=='zombie'),ids=new Set(players.map(e=>e.id)),
      plain=v=>v&&typeof v==='object'&&!Array.isArray(v),int=(v,max=Number.MAX_SAFE_INTEGER)=>Number.isSafeInteger(v)&&v>=0&&v<=max,
      pos=v=>plain(v)&&['x','y','z'].every(k=>Number.isFinite(v[k])&&Math.abs(v[k])<=C.MAP.worldLimit+160),
      owner=a=>ids.has(a.owner)&&int(a.life,b.entities.find(e=>e.id===a.owner).deaths);
    if(!plain(p.branchState)||Object.keys(p.branchState).length!==players.length||!int(p.nextBranchZone)||p.nextBranchZone<1||
      !Array.isArray(p.branchZones)||p.branchZones.length>24||!Array.isArray(p.branchEchoes)||p.branchEchoes.length>8)throw Error('Invalid branch state');
    for(const player of players) {
      const s=p.branchState[player.id];
      if(!plain(s)||Object.keys(s).sort().join()!==Object.keys(fresh(0)).sort().join()||
        !Object.values(s).every(v=>int(v,b.tick+600))||!int(s.life,player.deaths)||!int(s.bonus,4)||!int(s.refunds,2)||!int(s.deploy,90)||!int(s.guard,25)||!int(s.shots,2)||!int(s.chargeReady,1)||
        (s.bonus&&!p.upgrades[player.id].lightMagazine)||(s.deploy&&!p.upgrades[player.id].bipod)||
        (s.guard&&!p.upgrades[player.id].guardPlate)||(s.chargeReady&&!p.upgrades[player.id].energyReturn))throw Error('Invalid branch player');
      for(const r of routes)if(r.keys.some(key=>p.upgrades[player.id][key]>0)&&!allowed(p.upgrades[player.id],r.keys[0]))throw Error('Conflicting weapon branches');
    }
    if(new Set(p.branchZones.map(a=>a.id)).size!==p.branchZones.length)throw Error('Invalid branch zones');
    for(const a of p.branchZones)if(!plain(a)||!owner(a)||!int(a.id,p.nextBranchZone-1)||!pos(a.from)||!pos(a.to)||!['laser','rocket'].includes(a.weapon)||
      ![1,3,5,8].includes(a.radius)||![15,20].includes(a.damage)||
      (a.weapon==='laser'?(!p.upgrades[a.owner].hotTrail||a.radius!==1||a.damage!==20||a.spread):
        (!p.upgrades[a.owner].napalm||a.radius===1||(a.radius===8&&!p.upgrades[a.owner].inferno)||
          (a.radius===3?(a.damage!==15||a.spread):a.damage!==20)||(a.spread&&!p.upgrades[a.owner].embers)))||!int(a.until,b.tick+360)||a.until<=b.tick||
      !int(a.nextTick,b.tick+30)||a.nextTick<=b.tick||typeof a.spread!=='boolean'||!plain(a.stacks)||Object.keys(a.stacks).length>33||
      Object.entries(a.stacks).some(([id,n])=>!b.entities.some(e=>e.id===id&&e.tankType==='zombie')||!int(n,4)))throw Error('Invalid branch zone');
    for(const a of p.branchEchoes)if(!plain(a)||!owner(a)||!pos(a.from)||!pos(a.to)||!p.upgrades[a.owner].starfall||!int(a.at,b.tick+30)||a.at<=b.tick)throw Error('Invalid branch echo');
  }
  return Object.freeze({routes:Object.freeze(routes),rewards:Object.freeze(rewards),caps:Object.freeze(caps),routeFor,allowed,initialize,reset,weapon,reload,move,prepare,hit,afterShot,fireZone,tick,death,validate});
});
