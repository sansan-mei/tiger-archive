/* Universal PvE modules: one-time upgrades shared by every equipped weapon. */
(function(root,factory){
  const node=typeof module==="object"&&module.exports;
  const api=factory();
  if(node)module.exports=api;else (root.TankSystems??={}).modules=api;
})(typeof window==="undefined"?globalThis:window,function(){
  "use strict";
  const rewards=Object.freeze({
    modEmber:{name:"燃烧弹芯",description:"直接命中点燃敌人4秒，每秒14伤害",module:true},
    modFrost:{name:"冰霜弹芯",description:"直接命中令敌人减速45%，持续2.8秒",module:true},
    modFracture:{name:"破甲刻印",description:"直接命中令敌人进入破甲状态4秒",module:true},
    modCombustion:{name:"燃爆装置",description:"命中燃烧目标引爆5米范围，对最多4名其他敌人各造成56伤害",module:true},
    modCryo:{name:"碎冰装置",description:"命中减速目标引爆4米冰爆，对最多4名其他敌人各造成49伤害",module:true},
    modExploit:{name:"弱点破解器",description:"对已破甲目标的直接命中伤害提高35%",module:true},
    modSpread:{name:"余烬传染",description:"燃烧目标死亡时点燃6米内最多5名敌人",module:true},
    modGiantSlayer:{name:"猎巨弹芯",description:"直接命中重锤巨人或Boss时伤害提高21%",module:true},
    modOverload:{name:"雷暴电容",description:"每5次直接命中电击12米内最多4名其他敌人，各造成35伤害",module:true},
    modReprisal:{name:"破甲收割",description:"破甲目标死亡时冲击5米内最多4名其他敌人，各造成42伤害",module:true},
    modShockwave:{name:"震荡余波",description:"直接命中引发4米冲击，对最多3名其他敌人造成21/28/35伤害，最多3级",module:true},
  });
  const caps=Object.freeze({...Object.fromEntries(Object.keys(rewards).map(key=>[key,1])),modShockwave:3});
  function initialize(b) {
    b.pve.moduleStatus={};
    b.pve.moduleHits=Object.fromEntries(b.entities.filter(e=>e.tankType!=="zombie").map(e=>[e.id,0]));
  }
  function directDamage(b,target,shot,amount) {
    const u=b.pve.upgrades[shot.owner],state=b.pve.moduleStatus[target.id];
    let factor=1;
    if(u?.modExploit&&state?.fractureUntil>b.tick)factor*=1.35;
    if(u?.modGiantSlayer&&["brute","boss","titan"].includes(target.zombieType))factor*=1.21;
    return factor===1?amount:Math.round(amount*factor);
  }
  function burst(b,owner,from,radius,damage,exclude,limit=4) {
    if(b.moduleProcTick!==b.tick){b.moduleProcTick=b.tick;b.moduleProcCount=0;}
    if(b.moduleProcCount>=4)return;
    b.moduleProcCount++;
    b.emit("explosion",{owner,x:from.x,y:from.y,z:from.z,radius});
    let struck=0;
    b.moduleSecondary=true;
    try {
      for(const enemy of b.entities) {
        if(enemy.tankType!=="zombie"||!enemy.alive||enemy.id===exclude||struck>=limit)continue;
        const center={x:enemy.x,y:enemy.y+1.5,z:enemy.z};
        if(Math.hypot(center.x-from.x,center.y-from.y,center.z-from.z)>radius||
          b.collision(from,center,null,{bodies:false}))continue;
        b.damage(enemy,damage,owner,center);struck++;
      }
    } finally {b.moduleSecondary=false;}
  }
  function onHit(b,hit,shot,before) {
    const owner=b.getEntity(shot.owner),target=b.getEntity(hit.id),u=b.pve.upgrades[shot.owner];
    if(!owner||shot.ownerLife!==undefined&&owner.deaths!==shot.ownerLife||!target||target.tankType!=="zombie"||
      (!target.alive&&!before?.wasAlive)||!u)return;
    const previous=b.pve.moduleStatus[target.id],burning=before?.burning??(previous?.burnUntil>b.tick),
      slowed=before?.slowed??(target.slowUntil>b.tick);
    const origin={x:target.x,y:target.y+1.5,z:target.z};
    if(u.modShockwave)burst(b,owner.id,origin,4,14+7*u.modShockwave,target.id,3);
    if(u.modCombustion&&burning)burst(b,owner.id,origin,5,56,target.id);
    if(u.modCryo&&slowed)burst(b,owner.id,origin,4,49,target.id);
    if(target.alive&&(u.modEmber||u.modFracture)) {
      const state=b.pve.moduleStatus[target.id]??={burnUntil:0,burnNext:0,burnOwner:null,fractureUntil:0,fractureOwner:null};
      if(u.modEmber)Object.assign(state,{burnUntil:b.tick+240,
        burnNext:state.burnUntil>b.tick&&state.burnNext>0?state.burnNext:b.tick+60,burnOwner:owner.id});
      if(u.modFracture)Object.assign(state,{fractureUntil:b.tick+240,fractureOwner:owner.id});
    }
    if(target.alive&&u.modFrost)target.slowUntil=Math.max(target.slowUntil,b.tick+168);
    if(u.modOverload) {
      b.pve.moduleHits[owner.id]=(b.pve.moduleHits[owner.id]+1)%5;
      if(!b.pve.moduleHits[owner.id]) {
        if(b.moduleProcTick!==b.tick){b.moduleProcTick=b.tick;b.moduleProcCount=0;}
        if(b.moduleProcCount<4) {
          b.moduleProcCount++;
          let count=0;b.moduleSecondary=true;
          try {
            for(const enemy of b.entities) {
              if(enemy.tankType!=="zombie"||!enemy.alive||enemy.id===target.id||count>=4)continue;
              const to={x:enemy.x,y:enemy.y+1.5,z:enemy.z};
              if(Math.hypot(to.x-origin.x,to.y-origin.y,to.z-origin.z)>12||
                b.collision(origin,to,null,{bodies:false}))continue;
              b.damage(enemy,35,owner.id,to);
              b.emit("beam",{id:owner.id,from:origin,to,radius:.1,power:.6});count++;
            }
          } finally {b.moduleSecondary=false;}
        }
      }
    }
  }
  function onDeath(b,target,owner) {
    const state=b.pve.moduleStatus[target.id],u=b.pve.upgrades[owner],
      from={x:target.x,y:target.y+1.5,z:target.z};
    if(!b.moduleSecondary&&u?.modSpread&&state?.burnUntil>b.tick) {
      let count=0;
      for(const enemy of b.entities) {
        if(enemy.tankType!=="zombie"||!enemy.alive||count>=5)continue;
        const to={x:enemy.x,y:enemy.y+1.5,z:enemy.z};
        if(Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z)>6||b.collision(from,to,null,{bodies:false}))continue;
        const effect=b.pve.moduleStatus[enemy.id]??={burnUntil:0,burnNext:0,burnOwner:null,fractureUntil:0,fractureOwner:null};
        Object.assign(effect,{burnUntil:b.tick+240,
          burnNext:effect.burnUntil>b.tick&&effect.burnNext>0?effect.burnNext:b.tick+60,
          burnOwner:effect.burnUntil>b.tick?effect.burnOwner:state.burnOwner});count++;
      }
    }
    if(!b.moduleSecondary&&u?.modReprisal&&state?.fractureUntil>b.tick)burst(b,owner,from,5,42,target.id);
    delete b.pve.moduleStatus[target.id];
  }
  function tick(b) {
    for(const [id,state] of Object.entries(b.pve.moduleStatus)) {
      const target=b.getEntity(id);
      if(!target?.alive){delete b.pve.moduleStatus[id];continue;}
      if(state.burnUntil>=b.tick && state.burnNext>0 && b.tick>=state.burnNext) {
        state.burnNext=b.tick+60;
        b.damage(target,14,state.burnOwner,{x:target.x,y:target.y+1.5,z:target.z});
      }
      if(b.tick>=state.burnUntil)Object.assign(state,{burnUntil:0,burnNext:0,burnOwner:null});
      if(b.tick>=state.fractureUntil)Object.assign(state,{fractureUntil:0,fractureOwner:null});
      if(!state.burnUntil&&!state.fractureUntil)delete b.pve.moduleStatus[id];
    }
  }
  function validate(s) {
    const v=s.pve,players=s.entities.filter(e=>e.tankType!=="zombie"),
      owners=new Set(players.map(e=>e.id)),alive=new Set(s.entities.filter(e=>e.tankType==="zombie"&&e.alive).map(e=>e.id)),
      plain=o=>o&&typeof o==="object"&&!Array.isArray(o),
      tick=n=>Number.isSafeInteger(n)&&n>=0&&n<=s.tick+240;
    if(!plain(v.moduleStatus)||!plain(v.moduleHits)||
      Object.keys(v.moduleStatus).length>alive.size||Object.keys(v.moduleHits).length!==players.length||
      Object.entries(v.moduleHits).some(([id,n])=>!owners.has(id)||!Number.isSafeInteger(n)||n<0||n>4||
        (n>0&&!v.upgrades[id]?.modOverload)))throw Error("Invalid module state");
    for(const [id,state] of Object.entries(v.moduleStatus)) {
      if(!alive.has(id)||!plain(state)||
        !["burnUntil","burnNext","burnOwner","fractureUntil","fractureOwner"].every(k=>Object.hasOwn(state,k))||
        Object.keys(state).length!==5||!tick(state.burnUntil)||!tick(state.burnNext)||!tick(state.fractureUntil)||
        (!state.burnUntil&&!!state.burnNext)||
        (state.burnUntil>0&&(!owners.has(state.burnOwner)||!v.upgrades[state.burnOwner]?.modEmber||
          state.burnNext===0||state.burnNext<s.tick||state.burnNext>s.tick+60||
          state.burnNext>state.burnUntil))||
        (!state.burnUntil&&state.burnOwner!==null)||
        (state.fractureUntil>0&&(state.fractureUntil<s.tick||!owners.has(state.fractureOwner)||
          !v.upgrades[state.fractureOwner]?.modFracture))||
        (!state.fractureUntil&&state.fractureOwner!==null)||
        (!state.burnUntil&&!state.fractureUntil))throw Error("Invalid module status");
    }
  }
  return Object.freeze({rewards,caps,initialize,directDamage,onHit,onDeath,tick,validate});
});
