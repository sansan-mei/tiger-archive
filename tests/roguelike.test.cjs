const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),R=C.PVE.progression;
function make(n=1,map=null) {const b=new C.Battle({mode:'pve',participants:Array.from({length:n},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol'})),...(map?{map}:{})});b.start();b.pve.nextWaveAt=100000;return b;}
function enemy(b,i,x=0,z=55) {const e=b.entities.filter(e=>e.tankType==='zombie')[i];Object.assign(e,{x,z,y:0,floor:0,hp:e.maxHp,alive:true,protectedUntil:0});return e;}
function waveFour(b) {
  b.pve.wave=4;
  for(const z of b.entities.filter(e=>e.tankType==='zombie')){
    z.maxHp=C.PVE.healthFor(z.zombieType,b.pve.teamSize,4);
    if(z.alive)z.hp=z.maxHp;
  }
  return b;
}
function bucket(b,i,x,z) {
  const e=enemy(b,i,x,z);
  e.zombieType='bucket';e.maxHp=C.PVE.healthFor('bucket',b.pve.teamSize,b.pve.wave);e.hp=e.maxHp;
  return e;
}
function enterBossWave(b,wave=8) {
  for(const z of b.entities.filter(e=>e.tankType==='zombie'))Object.assign(z,{alive:false,hp:0,speed:0});
  Object.assign(b.pve.boss,{stage:wave===16?1:0,spawned:false,defeated:false,telegraph:null});
  b.pve.queue=0;b.pve.wave=wave-1;b.tick=Math.max(1,b.tick);b.pve.nextWaveAt=b.tick;b.step();
  return b.entities.find(e=>e.tankType==='zombie'&&e.alive&&['boss','titan'].includes(e.zombieType));
}
function hit(b,p,target,weapon='pistol',critical=false,extra={}) {b.resolveHit({kind:'tank',id:target.id,point:{x:target.x+.6,y:1.5,z:target.z}},
  {id:999,owner:p.id,ownerLife:p.deaths,weaponType:weapon,damage:C.WEAPONS[weapon].damage*(critical?(C.WEAPONS[weapon].criticalMultiplier||1):1),critical,dx:-1,dy:0,dz:0,...extra});}
test('kills share experience while reward choices are independent, queued and replay protected',()=>{
  const b=make(2), [p,q]=b.entities;
  for(let i=0;i<10;i++){const z=enemy(b,0);b.damage(z,10000,p.id,z);if(i<3)z.maxHp=C.PVE.healthFor(z.zombieType,2,b.pve.wave);}
  assert.equal(b.pve.level,3);assert.equal(b.pve.xp,0,'riskyWave=0 keeps base XP');
  assert.equal(b.pve.pending[p.id],2);assert.equal(b.pve.pending[q.id],2);
  assert.notEqual(b.pve.choiceIds[p.id],b.pve.choiceIds[q.id]);
  const first=b.pve.choiceIds[p.id], choices=b.pve.choices[p.id];
  assert.equal(b.chooseUpgrade(p.id,b.pve.wave,choices[0],first+100),false);
  assert.equal(b.chooseUpgrade(p.id,b.pve.wave,choices[0],first),true);
  assert.equal(b.pve.pending[p.id],1);assert.equal(b.pve.pending[q.id],2);
  assert.equal(b.chooseUpgrade(p.id,b.pve.wave,b.pve.choices[p.id][0],first),false);
  const saved=b.snapshot();const copy=make(2);copy.restore(saved);
  assert.deepEqual(copy.pve,b.pve);S.validateSnapshot(saved);
  b.pve.nextWaveAt=1;b.step();assert.equal(b.pve.pending[p.id],1);
});
test('eleven shared modules replace medkit and life leech while preserving regen',()=>{
  const keys=['modEmber','modFrost','modFracture','modCombustion','modCryo',
    'modExploit','modSpread','modGiantSlayer','modOverload','modReprisal','modShockwave'];
  assert.deepEqual(Object.keys(R.rewards).filter(k=>k.startsWith('mod')),keys);
  for(const key of keys){assert.equal(R.caps[key],key==='modShockwave'?3:1);assert.ok(C.PVE.rewards[key]);}
  for(const key of ['medkit','modLeech','nova','novaRange','frost','shatter']){
    assert.ok(!Object.hasOwn(C.PVE.rewards,key));assert.ok(!Object.hasOwn(R.caps,key));
  }
  assert.equal(R.caps.regen,3);
  assert.equal(C.PVE.rewards.regen.name,'自愈因子');
  const b=make(),p=b.entities[0];
  p.hp=40;b.pve.pending[p.id]=1;R.offer(b,p,C.PVE.rewards);
  assert.equal(b.chooseUpgrade(p.id,b.pve.wave,'medkit'),false);
  assert.equal(p.hp,40);
  delete b.pve.choices[p.id];
  for(const weapon of ['pistol','standard','rapid','laser','rocket']){
    p.weaponType=weapon;b.pve.pending[p.id]=1;delete b.pve.choices[p.id];
    R.offer(b,p,Object.fromEntries(keys.slice(0,3).map(k=>[k,C.PVE.rewards[k]])));
    assert.deepEqual(new Set(b.pve.choices[p.id]),new Set(keys.slice(0,3)));
  }
});
test('three-choice offers always include a non-weapon reward when one is eligible',()=>{
  const b=make(),p=b.entities[0];
  const pool=Object.fromEntries(['standard','rapid','rocket','modShockwave'].map(k=>[k,C.PVE.rewards[k]]));
  for(let seed=1;seed<=256;seed++) {
    b.pve.rng=Math.imul(seed,2654435761)>>>0;
    b.pve.pending[p.id]=1;delete b.pve.choices[p.id];R.offer(b,p,pool);
    const options=b.pve.choices[p.id];
    assert.equal(options.length,3);
    assert.equal(new Set(options).size,3);
    assert.ok(options.some(key=>!Object.hasOwn(C.WEAPONS,key)),`seed ${seed}: ${options}`);
  }
});
test('final shockwave layer keeps three choices after other non-weapon rewards cap',()=>{
  const b=make(),p=b.entities[0];
  Object.assign(b.pve.upgrades[p.id],R.caps,{modShockwave:2});
  b.pve.level=20;
  for(let seed=1;seed<=128;seed++) {
    b.pve.rng=Math.imul(seed,2654435761)>>>0;
    b.pve.pending[p.id]=1;delete b.pve.choices[p.id];R.offer(b,p,C.PVE.rewards);
    const options=b.pve.choices[p.id];
    assert.equal(options.length,3);
    assert.equal(new Set(options).size,3);
    assert.ok(options.includes('modShockwave'),`seed ${seed}: ${options}`);
  }
  S.validateSnapshot(b.snapshot());
});
test('weapon evolution is favored but not guaranteed in randomized three-choice offers',()=>{
  const b=make(),p=b.entities[0],seen={pierce:0,modShockwave:0};let missed=false;
  for(let seed=1;seed<=256;seed++) {
    b.pve.rng=Math.imul(seed,2654435761)>>>0;
    b.pve.pending[p.id]=1;delete b.pve.choices[p.id];R.offer(b,p,C.PVE.rewards);
    const options=b.pve.choices[p.id];
    assert.equal(options.length,3);assert.equal(new Set(options).size,3);
    assert.ok(options.some(key=>!Object.hasOwn(C.WEAPONS,key)));
    assert.ok(!options.includes('ricochet'));
    if(!options.includes('pierce'))missed=true;
    if(options.includes('pierce'))seen.pierce++;
    if(options.includes('modShockwave'))seen.modShockwave++;
  }
  assert.ok(missed,'the current weapon branch must sometimes miss');
  assert.ok(seen.pierce>seen.modShockwave,'the current weapon branch should be favored over a normal reward');
});
test('offers enforce evolution prerequisites and stop increasing capped passives',()=>{
  const b=make(),p=b.entities[0],pool=Object.fromEntries(['pierce','ricochet','lightning','modShockwave','haste'].map(k=>[k,C.PVE.rewards[k]]));
  R.addExperience(b,40,pool);
  assert.ok(b.pve.choices[p.id].includes('pierce'));
  assert.ok(!b.pve.choices[p.id].includes('lightning'));
  b.chooseUpgrade(p.id,b.pve.wave,'pierce');
  R.addExperience(b,60,pool);
  assert.ok(b.pve.choices[p.id].includes('ricochet'));
  assert.equal(b.chooseUpgrade(p.id,b.pve.wave,'lightning'),false);
  b.chooseUpgrade(p.id,b.pve.wave,'ricochet');R.addExperience(b,80,pool);
  assert.ok(b.pve.choices[p.id].includes('lightning'));
  assert.ok(b.pve.upgrades[p.id].pierce===1);
  const copy=make();copy.restore(b.snapshot());
  b.chooseUpgrade(p.id,b.pve.wave,'lightning');copy.chooseUpgrade(p.id,copy.pve.wave,'lightning');
  R.addExperience(b,100,C.PVE.rewards);R.addExperience(copy,100,C.PVE.rewards);
  assert.deepEqual(copy.pve.choices,b.pve.choices);
});
test('every weapon has exactly five gated exclusive evolution tiers',()=>{
  const expected={
    pistol:['pierce','ricochet','lightning','conductor','thunder'],
    standard:['heavyShell','execution','penetrator','earthquake','judgment'],
    rapid:['suppression','crossfire','multiCross','rupture','metalStorm'],
    laser:['wideBeam','capacitor','plasmaBurst','refraction','stellar'],
    rocket:['blast','fire','chain','cluster','doomsday'],
  };
  const routes=Object.groupBy(Object.entries(R.rewards).filter(([,r])=>r.weapon),([,r])=>r.weapon);
  for(const [weapon,keys] of Object.entries(expected)) {
    assert.deepEqual(routes[weapon].map(([key])=>key),keys,weapon);
    keys.forEach((key,i)=>assert.equal(R.rewards[key].requires,i?keys[i-1]:undefined,key));
    assert.ok(keys.every(key=>R.caps[key]===1),weapon);
  }
  const b=make(),p=b.entities[0];
  for(const [weapon,keys] of Object.entries(expected)) {
    p.weaponType=weapon;
    for(let tier=0;tier<keys.length;tier++) {
      const candidates={[keys[tier]]:R.rewards[keys[tier]]};
      if(keys[tier+1])candidates[keys[tier+1]]=R.rewards[keys[tier+1]];
      b.pve.pending[p.id]=1;delete b.pve.choices[p.id];R.offer(b,p,candidates);
      assert.ok(b.pve.choices[p.id].includes(keys[tier]),weapon+' tier '+(tier+1));
      assert.ok(!b.pve.choices[p.id].includes(keys[tier+1]),weapon+' future tier');
      b.pve.upgrades[p.id][keys[tier]]=1;
    }
  }
  assert.ok(Object.hasOwn(C.PVE.rewards,'standard'));
});
test('giant slayer raises direct damage against giants and bosses, not regular enemies',()=>{
  const b=make(),p=b.entities[0],boss=enterBossWave(b,8),u=b.pve.upgrades[p.id];
  boss.protectedUntil=0;
  u.modGiantSlayer=1;
  const hp=boss.hp;hit(b,p,boss);
  assert.equal(hp-boss.hp,26);
  assert.equal(C.PVE.progression.moduleDamage(b,{zombieType:'brute'}, {owner:p.id},100),130);
  assert.equal(C.PVE.progression.moduleDamage(b,{zombieType:'walker'}, {owner:p.id},100),100);
  u.modExploit=1;u.modFracture=1;
  b.pve.moduleStatus[boss.id]={fractureUntil:b.tick+240};
  assert.equal(C.PVE.progression.moduleDamage(b,boss,{owner:p.id},100),195);
});
test('shockwave direct hits damage only three nearby secondary targets',()=>{
  const b=waveFour(make()),p=b.entities[0],primary=enemy(b,0,0,55),nearby=Array.from({length:4},(_,i)=>bucket(b,i+1,2+i*.5,55)),
    far=enemy(b,5,8,55);
  b.pve.upgrades[p.id].modShockwave=1;
  hit(b,p,primary);
  assert.equal(primary.hp,primary.maxHp-20);
  assert.deepEqual(nearby.map(e=>e.maxHp-e.hp),[30,30,30,0]);
  assert.equal(far.hp,far.maxHp);
  assert.equal(b.events.filter(e=>e.type==='explosion'&&e.radius===4).length,1);
});
test('shockwave gains ten secondary damage per level and caps at three',()=>{
  for(const [level,damage] of [[1,30],[2,40],[3,50]]) {
    const b=waveFour(make()),p=b.entities[0],primary=enemy(b,0,0,55),side=bucket(b,1,2,55);
    b.pve.upgrades[p.id].modShockwave=level;
    hit(b,p,primary);
    assert.equal(side.maxHp-side.hp,damage,`level ${level}`);
  }
});
test('shockwave damage and explosion survive the authoritative network packet',()=>{
  const a=new S.Authority({mode:'pve',participants:[{id:'p0',controller:'human',tankType:'human',weaponType:'pistol'}]}),
    b=a.battle,p=b.entities[0];
  b.start();waveFour(b);b.pve.nextWaveAt=100000;
  const primary=enemy(b,0,0,55),side=bucket(b,1,2,55);
  b.pve.upgrades[p.id].modShockwave=3;
  S.validateSnapshot(b.snapshot());
  const replica=new S.Replica();replica.welcome(a.attach('peer',p.id));
  const previous=b.events.length;
  hit(b,p,primary);
  a.history.push(...b.events.slice(previous));
  const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);
  const received=replica.receive(packet);
  assert.equal(received.ok,true,received.reason);
  assert.equal(replica.current.entities.find(e=>e.id===side.id).hp,side.maxHp-50);
  assert.ok(received.events.some(e=>e.type==='explosion'&&e.radius===4));
});
test('v29 checkpoints and retired healing upgrades are rejected',()=>{
  const b=make(),saved=b.snapshot();
  const old=C.clone(saved);old.version=29;
  assert.throws(()=>S.validateSnapshot(old),/Invalid snapshot header/);
  saved.pve.upgrades.p0.modLeech=1;
  assert.throws(()=>S.validateSnapshot(saved),/Invalid run upgrade/);
});
test('an in-flight shot keeps shockwave after changing weapons',()=>{
  const b=waveFour(make()),p=b.entities[0],primary=enemy(b,0,0,55),side=bucket(b,1,2,55);
  p.weaponType='rapid';b.pve.upgrades[p.id].modShockwave=3;
  assert.equal(b.shoot(p),true);
  const shot=b.bullets[0];assert.ok(shot&&shot.weaponType==='rapid');
  p.weaponType='pistol';
  b.resolveHit({kind:'tank',id:primary.id,point:{x:primary.x+.6,y:1.5,z:primary.z}},shot);
  assert.equal(side.hp,side.maxHp-50);
  assert.ok(b.events.some(e=>e.type==='explosion'&&e.radius===4));
});
test('eight-player shockwaves stay within the module and network event budgets',()=>{
  const a=new S.Authority({mode:'pve',participants:Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol'}))}),
    b=a.battle;
  b.start();b.pve.wave=1;b.pve.nextWaveAt=100000;
  const primary=enemy(b,0,0,55);
  for(let i=1;i<=4;i++)enemy(b,i,2+i*.2,55);
  for(const p of b.entities.filter(e=>e.tankType!=='zombie'))b.pve.upgrades[p.id].modShockwave=3;
  S.validateSnapshot(b.snapshot());
  const replica=new S.Replica();replica.welcome(a.attach('peer','p0'));
  const previous=b.events.length;
  for(const p of b.entities.filter(e=>e.tankType!=='zombie'))hit(b,p,primary);
  a.history.push(...b.events.slice(previous));
  assert.equal(b.moduleProcCount,4);
  const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
  assert.equal(packet.events.filter(e=>e.type==='explosion'&&e.radius===4).length,4);
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);
  assert.equal(replica.receive(packet).ok,true);
});
test('shared elemental modules apply across all five weapons and burn on authority ticks',()=>{
  for(const weapon of ['pistol','standard','rapid','laser','rocket']) {
    const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
    p.weaponType=weapon;Object.assign(z,{hp:500,maxHp:500});
    Object.assign(b.pve.upgrades[p.id],{modEmber:1,modFrost:1,modFracture:1});
    hit(b,p,z,weapon);
    assert.equal(z.slowUntil,b.tick+240,weapon);
    assert.equal(b.pve.moduleStatus[z.id].burnUntil,b.tick+240,weapon);
    assert.equal(b.pve.moduleStatus[z.id].fractureUntil,b.tick+240,weapon);
    const hp=z.hp;b.tick=60;R.tick(b);
    assert.equal(z.hp,hp-20,weapon);
  }
});
test('rapid repeated hits refresh burn expiry without postponing scheduled damage',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  Object.assign(z,{hp:500,maxHp:500});b.pve.upgrades[p.id].modEmber=1;
  for(let tick=1;tick<=200;tick++){
    b.tick=tick;
    if(tick%20===0)hit(b,p,z);
    R.tick(b);
  }
  assert.equal(z.hp,240,'ten direct hits and three scheduled burn ticks');
});
test('spreading flames refreshes an already burning target without delaying its tick',()=>{
  const b=make(),p=b.entities[0],source=enemy(b,0,0,55),near=enemy(b,1,2,55);
  Object.assign(near,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{modEmber:1,modSpread:1});
  hit(b,p,source);hit(b,p,near);
  const before=near.hp;b.tick=20;
  b.damage(source,1000,p.id,{x:source.x,y:1.5,z:source.z});
  assert.equal(b.pve.moduleStatus[near.id].burnNext,60);
  b.tick=60;R.tick(b);assert.equal(near.hp,before-20);
});
test('an in-flight old-weapon projectile retains shared modules after switching',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55),near=enemy(b,1,2,55);
  Object.assign(z,{hp:500,maxHp:500});Object.assign(near,{hp:500,maxHp:500});
  p.weaponType='rapid';Object.assign(b.pve.upgrades[p.id],{modEmber:1,modFracture:1,modExploit:1,modOverload:1});
  hit(b,p,z,'rapid');b.pve.moduleHits[p.id]=4;
  b.shoot(p);const shot=b.bullets[0];assert.ok(shot&&shot.weaponType==='rapid');
  const before=z.hp;p.weaponType='pistol';
  b.resolveHit({kind:'tank',id:z.id,point:{x:z.x+.6,y:1.5,z:z.z}},shot);
  assert.equal(z.hp,before-Math.round(shot.damage*1.5));
  assert.equal(b.pve.moduleHits[p.id],0);
  assert.ok(b.events.some(e=>e.type==='beam'));
});
test('shared burn and fracture modules combine across a weapon switch',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55),side=enemy(b,1,2,55);
  for(const e of [z,side])Object.assign(e,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{modEmber:1,modFracture:1,modCombustion:1,modExploit:1});
  hit(b,p,z);assert.equal(side.hp,500);
  p.weaponType='standard';const before=z.hp;
  hit(b,p,z,'standard');
  assert.equal(z.hp,before-53,'marked direct hit gains half damage but blast does not hit direct target');
  assert.equal(side.hp,420,'burning target triggers one 5m secondary blast');
  assert.ok(b.events.some(e=>e.type==='explosion'&&e.radius===5));
});
test('frost and cryo modules shatter slowed targets without double hitting the primary',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55),side=enemy(b,1,2,55);
  for(const e of [z,side])Object.assign(e,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{modFrost:1,modCryo:1});
  hit(b,p,z);assert.equal(side.hp,500);
  p.weaponType='standard';hit(b,p,z,'standard');
  assert.equal(z.hp,445);assert.equal(side.hp,430);
  assert.ok(b.events.some(e=>e.type==='explosion'&&e.radius===4));
});
test('shared kill modules spread burning and burst fractured enemies without healing',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55),side=enemy(b,1,2,55);
  Object.assign(z,{hp:100,maxHp:100});Object.assign(side,{hp:300,maxHp:300});p.hp=10;
  Object.assign(b.pve.upgrades[p.id],{modEmber:1,modFracture:1,modSpread:1,modReprisal:1});
  hit(b,p,z);b.damage(z,1000,p.id,{x:z.x,y:1.5,z:z.z});
  assert.equal(p.hp,10);assert.equal(side.hp,240);
  assert.equal(b.pve.moduleStatus[side.id].burnUntil,b.tick+240);
  b.tick=60;R.tick(b);assert.equal(side.hp,220);
  assert.equal(b.events.filter(e=>e.type==='explosion'&&e.radius===5).length,1);
});
test('overload counts five direct hits across weapons and arcs to at most four targets',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  Object.assign(z,{hp:500,maxHp:500});
  const nearby=Array.from({length:6},(_,i)=>enemy(b,i+1,2+i*.5,55));
  nearby.forEach(e=>Object.assign(e,{hp:500,maxHp:500}));
  b.pve.upgrades[p.id].modOverload=1;
  for(let i=0;i<4;i++)hit(b,p,z);
  assert.equal(b.pve.moduleHits[p.id],4);
  assert.ok(nearby.every(e=>e.hp===500));
  p.weaponType='standard';hit(b,p,z,'standard');
  assert.equal(b.pve.moduleHits[p.id],0);
  assert.equal(nearby.filter(e=>e.hp<500).length,4);
  assert.ok(b.events.filter(e=>e.type==='beam').length<=4);
});
test('a spread module reuses the original burner owner across players',()=>{
  const b=make(2),[burner,spreader]=b.entities,z=enemy(b,0,0,55),side=enemy(b,1,2,55);
  b.pve.upgrades[burner.id].modEmber=1;
  b.pve.upgrades[spreader.id].modSpread=1;
  hit(b,burner,z);b.damage(z,1000,spreader.id,{x:z.x,y:1.5,z:z.z});
  assert.equal(b.pve.moduleStatus[side.id].burnOwner,burner.id);
  S.validateSnapshot(b.snapshot());
});
test('module secondary kills never trigger an in-flight rocket corpse chain',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55),side=enemy(b,1,2,55);
  p.weaponType='rocket';Object.assign(b.pve.upgrades[p.id],{blast:1,fire:1,chain:1,modEmber:1,modCombustion:1});
  Object.assign(z,{hp:500,maxHp:500});Object.assign(side,{hp:100,maxHp:100});
  hit(b,p,z,'rocket');
  b.pveChainBudget={owner:p.id,remaining:3};hit(b,p,z,'rocket');
  assert.equal(side.alive,false);assert.equal(b.pve.bursts.length,0);
  b.pveChainBudget=null;
});
test('lethal direct hits still count overload and trigger combustion on burning targets',()=>{
  const b=make(),p=b.entities[0],burning=enemy(b,0,0,55),side=enemy(b,1,2,55);
  Object.assign(burning,{hp:100,maxHp:100});Object.assign(side,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{modEmber:1,modCombustion:1,modOverload:1});
  hit(b,p,burning);burning.hp=1;hit(b,p,burning);
  assert.equal(side.hp,420,'lethal hit on burning enemy still explodes');
  for(let i=2;i<5;i++){const z=enemy(b,i,0,55);z.hp=1;hit(b,p,z);}
  assert.equal(b.pve.moduleHits[p.id],0);
  assert.ok(b.events.some(e=>e.type==='beam'));
});
test('a match ending on a pending burn tick remains a valid checkpoint',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  b.pve.upgrades[p.id].modEmber=1;hit(b,p,z);
  b.damage(p,1000,null,p);b.tick=59;b.step();
  assert.equal(b.status,'finished');
  S.validateSnapshot(b.snapshot());
  const marked=make(),m=marked.entities[0],other=enemy(marked,0,0,55);
  marked.pve.upgrades[m.id].modFracture=1;hit(marked,m,other);
  marked.damage(m,1000,null,m);marked.tick=239;marked.step();
  assert.equal(marked.status,'finished');
  S.validateSnapshot(marked.snapshot());
});
test('module secondary effects respect walls and the per-tick proc budget',()=>{
  const map=C.clone(C.MAP);
  map.obstacles=[{id:'module-wall',floor:0,x:2,z:55,w:1,d:8,h:4}];
  const b=make(1,map),p=b.entities[0],z=enemy(b,0,0,55),hidden=enemy(b,1,4,55);
  Object.assign(z,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{modEmber:1,modCombustion:1,modOverload:1,modShockwave:1});
  for(let i=0;i<10;i++)hit(b,p,z);
  assert.equal(hidden.hp,hidden.maxHp);
  assert.ok(b.events.filter(e=>e.type==='explosion'&&e.radius===5).length<=4);
  assert.ok(b.events.filter(e=>e.type==='explosion'&&e.radius===4).length<=4);
  assert.ok(b.moduleProcCount<=4);
});
test('checkpoint rejects a burning status with no next damage tick',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  b.pve.upgrades[p.id].modEmber=1;hit(b,p,z);
  const bad=b.snapshot();bad.pve.moduleStatus[z.id].burnNext=0;
  assert.throws(()=>S.validateSnapshot(bad),/Invalid module status/);
});
test('checkpoint rejects fracture when no player owns its applier',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  b.pve.upgrades[p.id].modExploit=1;
  const bad=b.snapshot();bad.pve.moduleStatus[z.id]={
    burnUntil:0,burnNext:0,burnOwner:null,fractureUntil:b.tick+240};
  assert.throws(()=>S.validateSnapshot(bad),/Invalid module status/);
  bad.pve.moduleStatus[z.id].fractureOwner=p.id;
  assert.throws(()=>S.validateSnapshot(bad),/Invalid module status/);
});
test('module burn state and overload counters restore but forged states are rejected',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  Object.assign(b.pve.upgrades[p.id],{modEmber:1,modOverload:1});
  hit(b,p,z);
  const saved=b.snapshot();S.validateSnapshot(saved);
  const copy=make();copy.restore(saved);assert.deepEqual(copy.pve,b.pve);
  for(const mutate of [
    s=>{s.pve.moduleHits[p.id]=5;},
    s=>{s.pve.moduleStatus[z.id].burnOwner='forged';},
    s=>{s.pve.moduleStatus[z.id].burnUntil=s.tick+10000;},
    s=>{s.pve.moduleStatus.not_a_zombie=s.pve.moduleStatus[z.id];},
  ]){const invalid=b.snapshot();mutate(invalid);assert.throws(()=>S.validateSnapshot(invalid));}
});
test('boss arrival and zombie-slot reuse clear all stale module statuses',()=>{
  const b=make(),p=b.entities[0],z=enemy(b,0,0,55);
  b.pve.upgrades[p.id].modEmber=1;hit(b,p,z);
  assert.ok(b.pve.moduleStatus[z.id]);
  b.pve.wave=7;b.pve.nextWaveAt=b.tick+1;b.tick=1;
  b.step();
  assert.equal(b.pve.wave,8);
  assert.ok(!b.pve.moduleStatus[z.id]);
  S.validateSnapshot(b.snapshot());
});
test('five-tier counters and prerequisites survive checkpoints and reject forgery',()=>{
  const b=make(),p=b.entities[0],u=b.pve.upgrades[p.id],keys=Object.keys(R.rewards).filter(k=>R.rewards[k].weapon);
  for(const key of keys)u[key]=1;
  Object.assign(b.pve.hits,{[p.id]:1});Object.assign(b.pve.rapidHits,{[p.id]:4});Object.assign(b.pve.rocketShots,{[p.id]:2});
  const saved=b.snapshot();S.validateSnapshot(saved);const copy=make();copy.restore(saved);assert.deepEqual(copy.pve,b.pve);
  const bad=saved;bad.pve.upgrades[p.id].cluster=0;
  assert.throws(()=>S.validateSnapshot(bad),/Invalid run upgrade/);
  const badCounter=b.snapshot();badCounter.pve.rocketShots[p.id]=3;
  assert.throws(()=>S.validateSnapshot(badCounter),/Invalid run upgrade/);
});
test('pistol evolves into bounded penetration, lightning network and magazine thunder',()=>{
  const b=make(),p=b.entities[0];Object.assign(p,{x:10,z:55,ammo:0,cooldown:90});
  const group=Array.from({length:11},(_,i)=>i?enemy(b,i,Math.cos(i*Math.PI/5)*6,55+Math.sin(i*Math.PI/5)*6):enemy(b,0,0,55));
  for(const z of group)Object.assign(z,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{pierce:1,ricochet:1,lightning:1,conductor:1,thunder:1});
  b.pve.hits[p.id]=1;hit(b,p,group[0],'pistol',false,{magazineFinal:true});
  assert.equal(group[0].hp,360); // direct 20 plus the 120 thunder burst
  assert.ok(group.slice(1).filter(z=>z.hp<500).length>=8);
  assert.equal(b.pve.hits[p.id],0);assert.equal(p.ammo,9);assert.equal(p.cooldown,0);
  assert.ok(b.events.some(e=>e.type==='explosion'&&e.radius===8));
  assert.ok(b.events.filter(e=>e.type==='beam').length<=15);
});
test('piercing and arcs respect solid cover',()=>{
  const b=make(),p=b.entities[0];Object.assign(p,{x:30,z:9});
  const a=enemy(b,0,25,9),hidden=enemy(b,1,10,9);
  Object.assign(b.pve.upgrades[p.id],{pierce:1,ricochet:1,lightning:1});b.pve.hits[p.id]=2;
  hit(b,p,a);assert.equal(hidden.hp,hidden.maxHp);
});
test('standard cannon evolves into a delayed ten-metre judgment strike',()=>{
  const b=make(),p=b.entities[0],elite=enemy(b,0,0,55),near=enemy(b,1,0,60),behind=enemy(b,2,-7,55);
  Object.assign(p,{weaponType:'standard'});for(const z of [elite,near,behind])Object.assign(z,{hp:1000,maxHp:1000});
  Object.assign(elite,{zombieType:'brute'});
  Object.assign(b.pve.upgrades[p.id],{heavyShell:1,execution:1,penetrator:1,earthquake:1,judgment:1});
  hit(b,p,elite,'standard',true,{damage:200});
  assert.equal(elite.hp,500);assert.equal(near.hp,850);assert.equal(behind.hp,650);
  assert.ok(b.events.some(e=>e.type==='explosion'&&e.radius===10));
  assert.deepEqual(b.pve.bursts.map(x=>[x.kind,x.at,x.radius,x.damage]),[['quake',30,8,60]]);
  b.tick=29;R.tick(b);assert.equal(elite.hp,500);
  b.tick=30;R.tick(b);assert.equal(elite.hp,440);assert.equal(near.hp,790);assert.equal(behind.hp,590);
  const delayed=b.events.findLast(e=>e.type==='explosion'&&e.radius===8);
  assert.deepEqual(Object.keys(delayed).sort(),['epoch','eventId','owner','radius','tick','type','x','y','z']);
});
test('in-flight tier-five shots fall back to base damage and effects after a weapon switch',()=>{
  const b=make(),p=b.entities[0],u=b.pve.upgrades[p.id];Object.assign(p,{x:20,z:55,weaponType:'standard',ammo:0,aim:0,pitch:0,criticalProgress:2});
  Object.assign(u,{heavyShell:1,execution:1,penetrator:1,earthquake:1,judgment:1,blast:1,fire:1,chain:1,cluster:1,doomsday:1});
  b.shoot(p);const judgment=b.bullets[0];assert.equal(judgment.damage,200);S.validateSnapshot(b.snapshot());
  b.bullets=[];p.weaponType='rapid';const elite=enemy(b,0,0,55);Object.assign(elite,{zombieType:'brute',hp:500,maxHp:500});
  b.resolveHit({kind:'tank',id:elite.id,point:{x:.6,y:1.5,z:55}},judgment);
  assert.equal(elite.hp,430);assert.equal(b.events.filter(e=>e.type==='explosion').length,0);
  Object.assign(p,{weaponType:'rocket',cooldown:0});b.bullets=[];
  for(let i=0;i<3;i++){p.cooldown=0;b.shoot(p);}const nuclear=b.bullets.at(-1);assert.equal(nuclear.doomsday,true);
  b.bullets=[];p.weaponType='rapid';b.events.length=0;const rocketTarget=enemy(b,1,0,55);Object.assign(rocketTarget,{hp:500,maxHp:500});
  b.resolveHit({kind:'tank',id:rocketTarget.id,point:{x:.6,y:1.5,z:55}},nuclear);
  assert.equal(rocketTarget.hp,400);assert.equal(b.events.find(e=>e.type==='explosion').radius,8);
  assert.equal(b.pve.hazards.length,0);assert.equal(b.events.filter(e=>e.type==='explosion').length,1);
});
test('rapid cannon evolves into doubled fire rate, rupture and bounded metal storm',()=>{
  const b=make(),p=b.entities[0],a=enemy(b,0,0,55),sides=[1,2,3,4,5,6].map((i,j)=>enemy(b,i,-j,58+j*.5));
  Object.assign(p,{x:10,z:55,weaponType:'rapid'});for(const z of [a,...sides])Object.assign(z,{hp:300,maxHp:300});
  Object.assign(b.pve.upgrades[p.id],{suppression:1,crossfire:1,multiCross:1,rupture:1,metalStorm:1});
  b.pve.rapidHits[p.id]=4;hit(b,p,a,'rapid');
  assert.equal(a.hp,287);assert.equal(a.slowUntil,180);
  assert.ok(sides.filter(z=>z.hp<=255).length>=3); // 15 crossfire plus 30 metal storm
  hit(b,p,a,'rapid');assert.equal(a.hp,266); // 13 direct plus 8 against an already slowed target
  p.cooldown=0;b.shoot(p);assert.equal(p.cooldown,9);
});
test('laser evolves into a stellar beam with three bounded bursts and refraction',()=>{
  const b=make(),p=b.entities[0],line=[enemy(b,0,0,55),enemy(b,1,-4,55),enemy(b,2,-8,55)],side=enemy(b,3,0,62);
  Object.assign(p,{x:10,z:56.3,weaponType:'laser',aim:0,pitch:0,cooldown:0});
  for(const z of line)Object.assign(z,{hp:250,maxHp:250});Object.assign(side,{hp:500,maxHp:500});
  Object.assign(b.pve.upgrades[p.id],{wideBeam:1,capacitor:1,plasmaBurst:1,refraction:1,stellar:1});b.shoot(p);
  assert.ok(line.every(z=>!z.alive));assert.equal(side.hp,280);
  assert.equal(b.events.find(e=>e.type==='beam').radius,1.5);
  assert.deepEqual(b.events.filter(e=>e.type==='explosion').map(e=>e.radius),[8,4,4]);
  assert.equal(p.cooldown,51);
});
test('rocket evolves into clustered fire and every third shot becomes doomsday',()=>{
  const b=make(),p=b.entities[0],u=b.pve.upgrades[p.id];Object.assign(p,{x:20,z:55,weaponType:'rocket',aim:0,pitch:0});
  Object.assign(u,{blast:1,fire:1,chain:1,cluster:1,doomsday:1});
  const near=enemy(b,0,0),far=enemy(b,1,-7);for(const z of [near,far])Object.assign(z,{hp:1000,maxHp:1000});
  hit(b,p,near,'rocket',false,{doomsday:false});
  assert.equal(b.events.filter(e=>e.type==='explosion'&&e.radius===4).length,5);
  assert.equal(b.events.findLast(e=>e.type==='explosion').radius,10);
  assert.deepEqual([b.pve.hazards[0].radius,b.pve.hazards[0].damage,b.pve.hazards[0].until],[5,15,240]);
  b.events.length=0;b.pve.hazards=[];b.bullets=[];
  for(let i=0;i<3;i++){p.cooldown=0;b.shoot(p);}
  assert.deepEqual(b.bullets.map(x=>x.doomsday),[false,false,true]);assert.equal(b.pve.rocketShots[p.id],0);
  const nuclear=b.bullets.at(-1);b.bullets=[];
  b.resolveHit({kind:'tank',id:near.id,point:{x:.6,y:1.5,z:55}},nuclear);
  assert.equal(b.events.findLast(e=>e.type==='explosion').radius,16);
  assert.deepEqual([b.pve.hazards[0].radius,b.pve.hazards[0].damage,b.pve.hazards[0].until],[8,20,300]);
  const crowded=make(),cp=crowded.entities[0],cu=crowded.pve.upgrades[cp.id];Object.assign(cp,{x:20,z:55,weaponType:'rocket'});
  Object.assign(cu,{blast:1,fire:1,chain:1,cluster:1,doomsday:1});
  const packed=crowded.entities.filter(e=>e.tankType==='zombie').slice(0,16);packed.forEach((z,i)=>Object.assign(z,{alive:true,hp:60,maxHp:60,x:Math.cos(i*Math.PI/8)*3,z:55+Math.sin(i*Math.PI/8)*3,y:0,floor:0,protectedUntil:0}));
  hit(crowded,cp,packed[0],'rocket',false,{doomsday:true});assert.equal(crowded.pve.bursts.length,3);

  const doomed=enemy(b,2,14,55);Object.assign(doomed,{hp:1,maxHp:1});b.pveChainBudget={owner:p.id,remaining:3};b.damage(doomed,1,p.id,doomed);b.pveChainBudget=null;
  assert.deepEqual(b.pve.bursts.map(x=>[x.kind,x.radius,x.damage]),[['chain',6,80]]);
  b.tick=1;R.tick(b);assert.equal(b.pve.bursts.length,0);
  assert.ok(b.events.some(e=>e.type==='explosion'&&e.radius===6));
});
test('removed pulse never auto-damages or slows nearby zombies',()=>{
  const b=make(),z=enemy(b,0,7,55);
  b.tick=239;b.step();
  assert.equal(z.hp,z.maxHp);assert.equal(z.slowUntil,0);
  assert.ok(!b.events.some(e=>e.type==='beam'));
  S.validateSnapshot(b.snapshot());
});
test('both bosses warn every living player for 96 ticks in solo and co-op, including enrage',()=>{
  for(const count of [1,2,8]){
    const b=make(count),p=b.entities[0],mid=enterBossWave(b,8);
    function check(boss){
      b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
      assert.equal(b.pve.boss.telegraph.at,b.tick+96);
      assert.equal(b.pve.boss.telegraph.zones.length,count);
      S.validateSnapshot(b.snapshot());
      boss.hp=boss.maxHp/2-1;b.pve.boss.telegraph=null;
      b.tick++;b.pve.boss.nextAttackAt=b.tick;R.bossAttack(b);
      assert.equal(b.pve.boss.telegraph.at,b.tick+96);
      assert.equal(b.pve.boss.telegraph.zones.length,count);
      S.validateSnapshot(b.snapshot());
    }
    check(mid);
    b.pve.boss.telegraph=null;mid.protectedUntil=0;b.damage(mid,100000,p.id,mid);b.step();
    b.pve.wave=15;b.pve.nextWaveAt=b.tick;b.step();
    const final=b.entities.find(e=>e.zombieType==='titan'&&e.alive);
    assert.ok(final);
    check(final);
  }
});
test('wave-eight boss warns before damage, revives teammates and does not end the campaign',()=>{
  const b=make(2),[p,q]=b.entities;b.damage(q,10000,null,q);
  const boss=enterBossWave(b,8);assert.ok(boss.alive);assert.equal(q.alive,true);
  assert.equal(b.pve.queue,0);assert.equal(b.pve.nextWaveAt,0);
  Object.assign(p,{x:0,z:55,protectedUntil:0});Object.assign(q,{x:1.8,z:55,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);const warning=C.clone(b.pve.boss.telegraph);
  assert.equal(warning.at,b.tick+96);assert.equal(warning.zones[0].radius,6);
  assert.equal(warning.zones.length,2);assert.equal(p.hp,80);
  p.x=12;b.tick=warning.at-1;R.bossAttack(b);assert.equal(q.hp,80);
  const copy=make(2);copy.restore(b.snapshot());S.validateSnapshot(copy.snapshot());
  b.tick++;copy.tick++;R.bossAttack(b);R.bossAttack(copy);
  assert.equal(p.hp,80);assert.equal(q.hp,35);assert.deepEqual(copy.snapshot(),b.snapshot());
  boss.protectedUntil=0;b.damage(boss,100000,p.id,boss);b.step();
  assert.equal(b.status,'playing');assert.equal(b.pve.result,null);assert.equal(b.pve.boss.spawned,false);
  const timed=make();timed.tick=16*60*C.TICK_RATE-1;timed.step();
  assert.equal(timed.status,'playing');assert.equal(timed.pve.result,null);
});
test('boss predicts movement with a faster wide strike and keeps summoning pressure',()=>{
  const b=make(1,C.MAP),p=b.entities[0];enterBossWave(b,8);
  Object.assign(p,{x:0,z:55,heading:0,speed:9,hp:10000,maxHp:10000,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  let warning=b.pve.boss.telegraph;const zombies=b.entities.filter(e=>e.tankType==='zombie'),boss=zombies.find(e=>e.zombieType==='boss');
  assert.equal(warning.at,b.tick+96);assert.equal(warning.zones[0].radius,6);
  assert.ok(warning.zones[0].x<-5,String(warning.zones[0].x));
  boss.hp=boss.maxHp/2-1;p.x=100;b.tick=warning.at;R.bossAttack(b);
  assert.equal(b.pve.boss.nextAttackAt,b.tick+120);
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);warning=b.pve.boss.telegraph;
  assert.equal(warning.zones[0].radius,7);
  for(let i=0;i<361;i++)b.step();
  assert.ok(zombies.filter(e=>e.alive&&!['boss','titan'].includes(e.zombieType)).length>=2);
});
test('predicted boss strikes follow the authoritative ramp height',()=>{
  const b=make(1,C.MAP),p=b.entities[0],ramp=b.map.ramps.find(r=>r.id==='west-01');
  enterBossWave(b,8);
  Object.assign(p,{x:ramp.a.x,z:16,y:C.rampHeight(b.map,ramp,16),floor:0,rampId:ramp.id,rampDir:1,
    heading:-Math.PI/2,speed:9,hp:80,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  const warning=b.pve.boss.telegraph,zone=warning.zones[0];
  assert.ok(Math.abs(zone.z-9.25)<1e-6,String(zone.z));
  assert.ok(Math.abs(zone.y-C.rampHeight(b.map,ramp,zone.z))<1e-6,String(zone.y));
  Object.assign(p,{x:zone.x,y:zone.y,z:zone.z});b.tick=warning.at;R.bossAttack(b);
  assert.equal(p.hp,35);
});
test('boss prediction stops at walls and lands airborne players on real decks',()=>{
  const b=make(1,C.MAP),p=b.entities[0],boss=enterBossWave(b,8);
  boss.hp=boss.maxHp/2-1;
  b.map.obstacles.push({id:'prediction-wall',floor:0,x:5,z:55,w:1,d:8,h:4});
  Object.assign(p,{x:10,z:55,y:0,floor:0,rampId:null,rampDir:0,falling:false,heading:0,speed:9});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  assert.ok(b.pve.boss.telegraph.zones[0].x>6,String(b.pve.boss.telegraph.zones[0].x));
  Object.assign(p,{x:70,z:55,y:8,floor:1,falling:true,fallVelocity:0,fallVX:0,fallVZ:0,speed:0});
  b.pve.boss.telegraph=null;b.pve.boss.nextAttackAt=b.tick;R.bossAttack(b);
  assert.equal(b.pve.boss.telegraph.zones[0].y,0);
});
test('progression and boss state reject malformed checkpoints and stay within packet limits',()=>{
  const a=new S.Authority({mode:'pve',participants:Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol'}))});
  const b=a.battle;b.start();R.addExperience(b,100,C.PVE.rewards);
  enterBossWave(b,8);b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  const r=new S.Replica();r.welcome(a.attach('peer','p0'));const packet=a.statePacket({network:true});
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);assert.equal(r.receive(packet).ok,true);
  for(const mutate of [s=>s.pve.pending.p0=99,s=>s.pve.level=21,s=>s.pve.boss.telegraph.zones[0].x=Infinity,
    s=>s.pve.boss.telegraph.zones[0].radius=100,s=>s.pve.upgrades.p0.execution=1,
    s=>s.pve.hazards=Array(13).fill({}),s=>s.pve.choiceIds.p0=s.pve.nextChoiceId]) {
    const invalid=b.snapshot();mutate(invalid);assert.throws(()=>S.validateSnapshot(invalid));
  }
});
test('deferred rewards survive death and a wave transition without auto-picking',()=>{
  const b=make(2),[p,q]=b.entities;R.addExperience(b,40,C.PVE.rewards);
  const offerId=b.pve.choiceIds[q.id],choice=b.pve.choices[q.id][0];
  b.damage(q,10000,null,q);b.step();
  assert.equal(b.pve.pending[q.id],1);assert.equal(b.chooseUpgrade(q.id,b.pve.wave,choice,offerId),false);
  b.pve.nextWaveAt=0;b.pve.queue=0;b.step();assert.equal(q.alive,true);
  assert.equal(b.pve.choiceIds[q.id],offerId);
  b.tick=b.pve.nextWaveAt;b.step();assert.equal(b.pve.pending[q.id],1);
  assert.equal(b.chooseUpgrade(q.id,b.pve.wave,choice,offerId),true);
  assert.equal(b.pve.pending[p.id],1);S.validateSnapshot(b.snapshot());
});
test('cone and runner telegraphs follow authoritative phases and release old meshes',()=>{
  const T=require('three'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const context=vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../client/pve-effects.js'),'utf8'),context);
  const scene=new T.Scene(),fx=context.window.TankClient.createPveEffects({T,scene}),b=make(),z=enemy(b,0,12,55);
  z.zombieType='cone';b.pve.enemyAttacks=[{owner:z.id,kind:'cone',phase:'warn',at:48,x:12,z:55,tx:0,tz:55}];
  fx.update(b.snapshot(),0);assert.equal(scene.children.length,1);
  assert.ok(scene.children[0].geometry instanceof T.RingGeometry);
  const warning=scene.children[0];b.pve.enemyAttacks[0].phase='flight';b.pve.enemyAttacks[0].x=6;
  fx.update(b.snapshot(),0);assert.equal(scene.children.length,1);
  assert.notEqual(scene.children[0],warning);assert.ok(scene.children[0].geometry instanceof T.IcosahedronGeometry);
  Object.assign(b.pve.enemyAttacks[0],{kind:'runner',phase:'warn',x:7,z:55,tx:2,tz:55});
  fx.update(b.snapshot(),0);
  assert.ok(scene.children[0].geometry instanceof T.BoxGeometry);
  assert.ok(scene.children[0].scale.z/2>=5/2+2,
    'dash warning extends past both locked-line endpoints by the 2m contact radius');
  assert.ok(scene.children[0].geometry.parameters.width*scene.children[0].scale.x>=4,
    'dash warning must cover the entire 2m contact radius on either side');
  b.pve.enemyAttacks[0].phase='stun';fx.update(b.snapshot(),0);
  assert.ok(scene.children[0].geometry instanceof T.RingGeometry);
  b.pve.enemyAttacks=[];fx.update(b.snapshot(),0);assert.equal(scene.children.length,0);
});
test('warning and fire visuals reuse rings and clear on return to PvP',()=>{
  const T=require('three'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
  const context=vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(path.join(__dirname,'../client/pve-effects.js'),'utf8'),context);
  const scene=new T.Scene(),fx=context.window.TankClient.createPveEffects({T,scene});
  const b=make();b.pve.boss.telegraph={at:90,zones:[{x:0,y:0,z:0,radius:6}]};
  fx.update(b.snapshot(),0);assert.equal(scene.children.length,1);
  const ring=scene.children[0];assert.equal(ring.scale.x,6);
  b.pve.boss.telegraph.zones[0].x=10;fx.update(b.snapshot(),0);
  assert.equal(scene.children[0],ring);assert.equal(ring.position.x,10);
  b.pve.hazards=[{id:1,x:4,y:.15,z:0,radius:3}];fx.update(b.snapshot(),0);
  assert.equal(scene.children.length,2);
  b.pve.boss.telegraph=null;fx.update(b.snapshot(),0);assert.equal(scene.children.length,1);
  fx.update({status:'playing'},0);assert.equal(scene.children.length,0);
});
