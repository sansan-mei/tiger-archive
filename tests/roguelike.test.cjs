const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),R=C.PVE.progression;
function make(n=1,map=null) {const b=new C.Battle({mode:'pve',participants:Array.from({length:n},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol'})),...(map?{map}:{})});b.start();b.pve.nextWaveAt=100000;return b;}
function enemy(b,i,x=0,z=55) {const e=b.entities.filter(e=>e.tankType==='zombie')[i];Object.assign(e,{x,z,y:0,floor:0,hp:e.maxHp,alive:true,protectedUntil:0});return e;}
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
  for(let i=0;i<10;i++){const z=enemy(b,0);b.damage(z,10000,p.id,z);}
  assert.equal(b.pve.level,3);assert.equal(b.pve.xp,0);
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
test('offers enforce evolution prerequisites and stop increasing capped passives',()=>{
  const b=make(),p=b.entities[0];R.addExperience(b,40,C.PVE.rewards);
  assert.ok(b.pve.choices[p.id].includes('pierce'));
  assert.ok(!b.pve.choices[p.id].includes('lightning'));
  b.chooseUpgrade(p.id,b.pve.wave,'pierce');
  R.addExperience(b,60,C.PVE.rewards);
  assert.ok(b.pve.choices[p.id].includes('ricochet'));
  assert.equal(b.chooseUpgrade(p.id,b.pve.wave,'lightning'),false);
  b.chooseUpgrade(p.id,b.pve.wave,'ricochet');R.addExperience(b,80,C.PVE.rewards);
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
      b.pve.pending[p.id]=1;delete b.pve.choices[p.id];R.offer(b,p,C.PVE.rewards);
      assert.ok(b.pve.choices[p.id].includes(keys[tier]),weapon+' tier '+(tier+1));
      assert.ok(!b.pve.choices[p.id].includes(keys[tier+1]),weapon+' future tier');
      b.pve.upgrades[p.id][keys[tier]]=1;
    }
  }
  assert.ok(Object.hasOwn(C.PVE.rewards,'standard'));
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
  hit(b,p,a);assert.equal(hidden.hp,80);
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
test('pulse build expands range, slows movement and doubles damage to slowed enemies',()=>{
  const b=make(),p=b.entities[0];Object.assign(p,{x:0,z:55});
  const z=enemy(b,0,7);
  Object.assign(b.pve.upgrades[p.id],{nova:1,novaRange:2,frost:1,shatter:1});
  b.tick=239;b.step();assert.equal(z.hp,60);assert.equal(z.slowUntil,540);
  Object.assign(z,{heading:0});for(let i=0;i<30;i++)b.tickEntity(z,C.normalizeInput({forward:true}));
  assert.ok(z.speed<=3.6*.55+1e-6);
  b.tick=479;b.step();assert.equal(z.hp,20);
  S.validateSnapshot(b.snapshot());
});
test('wave-eight boss warns before damage, revives teammates and does not end the campaign',()=>{
  const b=make(2),[p,q]=b.entities;b.damage(q,10000,null,q);
  const boss=enterBossWave(b,8);assert.ok(boss.alive);assert.equal(q.alive,true);
  assert.equal(b.pve.queue,0);assert.equal(b.pve.nextWaveAt,0);
  Object.assign(p,{x:0,z:55,protectedUntil:0});Object.assign(q,{x:1.8,z:55,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);const warning=C.clone(b.pve.boss.telegraph);
  assert.equal(warning.at,b.tick+60);assert.equal(warning.zones[0].radius,6);assert.equal(p.hp,80);
  p.x=12;b.tick=warning.at-1;R.bossAttack(b);assert.equal(q.hp,80);
  const copy=make(2);copy.restore(b.snapshot());S.validateSnapshot(copy.snapshot());
  b.tick++;copy.tick++;R.bossAttack(b);R.bossAttack(copy);
  assert.equal(p.hp,80);assert.equal(q.hp,35);assert.deepEqual(copy.snapshot(),b.snapshot());
  boss.protectedUntil=0;b.damage(boss,100000,p.id,boss);b.step();
  assert.equal(b.status,'playing');assert.equal(b.pve.result,null);assert.equal(b.pve.boss.spawned,false);
  const timed=make();timed.tick=C.RULES.pveDuration-1;timed.step();assert.equal(timed.pve.result,'defeat');
});
test('boss predicts movement with a faster wide strike and keeps summoning pressure',()=>{
  const b=make(1,C.MAP),p=b.entities[0];enterBossWave(b,8);
  Object.assign(p,{x:0,z:55,heading:0,speed:9,hp:10000,maxHp:10000,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  let warning=b.pve.boss.telegraph;const zombies=b.entities.filter(e=>e.tankType==='zombie'),boss=zombies.find(e=>e.zombieType==='boss');
  assert.equal(warning.at,b.tick+60);assert.equal(warning.zones[0].radius,6);
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
