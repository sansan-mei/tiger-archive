const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),R=C.PVE.progression;
function make(n=1) {const b=new C.Battle({mode:'pve',participants:Array.from({length:n},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol'}))});b.start();b.pve.nextWaveAt=100000;return b;}
function enemy(b,i,x=0,z=55) {const e=b.entities.filter(e=>e.tankType==='zombie')[i];Object.assign(e,{x,z,y:0,floor:0,hp:e.maxHp,alive:true,protectedUntil:0});return e;}
function hit(b,p,target,weapon='pistol') {b.resolveHit({kind:'tank',id:target.id,point:{x:target.x+.6,y:1.5,z:target.z}},
  {owner:p.id,ownerLife:p.deaths,weaponType:weapon,damage:C.WEAPONS[weapon].damage,critical:false,dx:-1,dy:0,dz:0});}
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
test('pistol pierces, ricochets and triggers lightning without friendly fire',()=>{
  const b=make(),p=b.entities[0];Object.assign(p,{x:10,z:55});
  const a=enemy(b,0,0),second=enemy(b,1,-3),third=enemy(b,2,-6);
  Object.assign(b.pve.upgrades[p.id],{pierce:1,ricochet:1,lightning:1});
  b.pve.hits[p.id]=2;hit(b,p,a);
  assert.equal(a.hp,60);assert.equal(second.hp,40);assert.equal(third.hp,45);
  assert.equal(p.hp,80);assert.equal(b.pve.hits[p.id],0);
  assert.ok(b.events.filter(e=>e.type==='beam').length>=4);
  S.validateSnapshot(b.snapshot());
});
test('piercing and arcs respect solid cover',()=>{
  const b=make(),p=b.entities[0];Object.assign(p,{x:30,z:9});
  const a=enemy(b,0,25,9),hidden=enemy(b,1,10,9);
  Object.assign(b.pve.upgrades[p.id],{pierce:1,ricochet:1,lightning:1});b.pve.hits[p.id]=2;
  hit(b,p,a);assert.equal(hidden.hp,80);
});
test('rocket build expands blast, burns over time, and bounds nonrecursive secondary explosions',()=>{
  const b=make(),p=b.entities[0];Object.assign(p,{x:20,z:55,weaponType:'rocket'});
  Object.assign(b.pve.upgrades[p.id],{blast:3,fire:1,chain:1});
  const near=enemy(b,0,0), far=enemy(b,1,-7);
  hit(b,p,near,'rocket');assert.ok(far.hp<80);assert.ok(b.pve.hazards.length===1);assert.ok(b.pve.bursts.length>0);
  const z=enemy(b,2,2);const before=z.hp;b.tick=30;R.tick(b);assert.ok(z.hp<before);
  assert.equal(b.pve.bursts.length,0);
  for(let i=0;i<20;i++)R.fireZone(b,{point:{x:0,y:1,z:55}}, {owner:p.id,weaponType:'rocket',dx:-1,dy:0,dz:0});
  assert.equal(b.pve.hazards.length,12);
  const copy=make();copy.restore(b.snapshot());
  b.tick=210;copy.tick=210;R.tick(b);R.tick(copy);
  assert.deepEqual(copy.snapshot(),b.snapshot());
  assert.equal(b.pve.hazards.length,0);
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
test('boss arrives at seven minutes, warns before damage, revives teammates and is required for victory',()=>{
  const b=make(2),[p,q]=b.entities;b.damage(q,10000,null,q);
  b.tick=C.RULES.duration-3601;b.step();
  const boss=b.entities.find(e=>e.zombieType==='boss');assert.ok(boss.alive);assert.equal(q.alive,true);
  assert.equal(b.pve.queue,0);assert.equal(b.pve.nextWaveAt,0);
  Object.assign(p,{x:0,z:55,protectedUntil:0});Object.assign(q,{x:1.8,z:55,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);const warning=C.clone(b.pve.boss.telegraph);
  assert.equal(warning.at,b.tick+60);assert.equal(warning.zones[0].radius,6);assert.equal(p.hp,80);
  p.x=12;b.tick=warning.at-1;R.bossAttack(b);assert.equal(q.hp,80);
  const copy=make(2);copy.restore(b.snapshot());S.validateSnapshot(copy.snapshot());
  b.tick++;copy.tick++;R.bossAttack(b);R.bossAttack(copy);
  assert.equal(p.hp,80);assert.equal(q.hp,35);assert.deepEqual(copy.snapshot(),b.snapshot());
  boss.protectedUntil=0;b.damage(boss,100000,p.id,boss);b.step();assert.equal(b.pve.result,'victory');
  const timed=make();timed.tick=C.RULES.duration-1;timed.step();assert.equal(timed.pve.result,'defeat');
});
test('boss predicts movement with a faster wide strike and keeps summoning pressure',()=>{
  const b=make(),p=b.entities[0];b.tick=C.RULES.duration-3601;b.step();
  Object.assign(p,{x:0,z:55,heading:0,speed:9,hp:10000,maxHp:10000,protectedUntil:0});
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  let warning=b.pve.boss.telegraph;const zombies=b.entities.filter(e=>e.tankType==='zombie'),boss=zombies.find(e=>e.zombieType==='boss');
  assert.equal(warning.at,b.tick+60);assert.equal(warning.zones[0].radius,6);
  assert.ok(warning.zones[0].x<-5,String(warning.zones[0].x));
  boss.hp=boss.maxHp/2-1;p.x=100;b.tick=warning.at;R.bossAttack(b);
  assert.equal(b.pve.boss.nextAttackAt,b.tick+120);
  b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);warning=b.pve.boss.telegraph;
  assert.equal(warning.zones[0].radius,7);
  for(let i=0;i<181;i++)b.step();
  assert.ok(zombies.filter(e=>e.alive&&e.zombieType!=='boss').length>=2);
});
test('progression and boss state reject malformed checkpoints and stay within packet limits',()=>{
  const a=new S.Authority({mode:'pve',participants:Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol'}))});
  const b=a.battle;b.start();R.addExperience(b,100,C.PVE.rewards);
  b.tick=C.RULES.duration-3601;a.step();b.tick=b.pve.boss.nextAttackAt;R.bossAttack(b);
  const r=new S.Replica();r.welcome(a.attach('peer','p0'));const packet=a.statePacket({network:true});
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);assert.equal(r.receive(packet).ok,true);
  for(const mutate of [s=>s.pve.pending.p0=99,s=>s.pve.level=21,s=>s.pve.boss.telegraph.zones[0].x=Infinity,
    s=>s.pve.boss.telegraph.zones[0].radius=100,s=>s.pve.hazards=Array(13).fill({}),s=>s.pve.choiceIds.p0=s.pve.nextChoiceId]) {
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
