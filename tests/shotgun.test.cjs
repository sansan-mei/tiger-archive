const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),R=C.PVE.progression;
function scene(tier=2) {
 const b=new C.Battle({mode:'pve',participants:[{id:'p',controller:'human',tankType:'human',weaponType:'pistol'},{id:'ally',controller:'human',tankType:'human',weaponType:'pistol'}]});b.start();b.pve.wave=4;b.pve.nextWaveAt=100000;
 for(const z of b.entities.filter(e=>e.tankType==='zombie'))z.maxHp=C.PVE.healthFor(z.zombieType,2,4);
 const p=b.getEntity('p'),u=b.pve.upgrades.p;
 Object.assign(p,{weaponType:'standard',ammo:0,x:0,z:55,y:0,floor:0,aim:0,pitch:0,protectedUntil:0});
 u.heavyShell=1;
 for(const key of ['shrapnel','fanShot','breach','siegeScatter'].slice(0,tier-1))choose(b,p,key);
 return {b,p,u};
}
function choose(b,p,key){b.pve.pending[p.id]=1;b.pve.choices[p.id]=[key,'regen','haste'];b.pve.choiceIds[p.id]=b.pve.nextChoiceId++;assert.equal(b.chooseUpgrade(p.id,0,key),true);}
function target(b,x=-4,type='bucket') {
 const z=b.entities.find(e=>e.tankType==='zombie');Object.assign(z,{x,z:55,y:0,floor:0,zombieType:type,alive:true,protectedUntil:0,shield:0,barrier:0,maxHp:C.PVE.healthFor(type,2,4)});z.hp=z.maxHp;return z;
}
function advance(b,p,n){for(let i=0;i<n;i++){b.tick++;b.tickEntity(p,{});}}
test('offhand shotgun acquisition is rejected without corrupting the equipped weapon',()=>{
 const {b,p}=scene(1);choose(b,p,'rocket');const ammo=p.ammo;
 b.pve.pending.p=1;b.pve.choices.p=['shrapnel','regen','haste'];b.pve.choiceIds.p=b.pve.nextChoiceId++;
 assert.equal(b.chooseUpgrade('p',0,'shrapnel'),false);assert.equal(p.weaponType,'rocket');assert.equal(p.ammo,ammo);
 assert.deepEqual(b.pve.magazines.p,{});
 choose(b,p,'standard');choose(b,p,'shrapnel');assert.equal(p.ammo,2);S.validateSnapshot(b.snapshot());
});
test('team defeat at mark expiry produces a valid final snapshot',()=>{
 const {b,p}=scene(3),z=target(b);z.hp=z.maxHp=10000;
 b.shoot(p);advance(b,p,18);b.shoot(p);const expiry=b.pve.scatterMarks[z.id].until;
 z.hp=z.maxHp=C.PVE.healthFor(z.zombieType,2,4);
 b.tick=expiry-1;
 for(const id of ['p','ally'])b.damage(b.getEntity(id),100000,z.id,{x:0,y:1.5,z:55});
 b.step();assert.equal(b.status,'finished');S.validateSnapshot(b.snapshot());
});
test('branch acquisition fires only three 35-damage pellets, no main projectile, and has two rounds',()=>{
 const {b,p}=scene(),z=target(b),hp=z.hp;
 assert.equal(p.ammo,2);assert.equal(b.shoot(p),true);assert.equal(hp-z.hp,105);
 assert.equal(b.bullets.length,0);assert.equal(b.events.filter(e=>e.type==='beam').length,3);
 assert.equal(p.ammo,1);assert.equal(p.cooldown,18);S.validateSnapshot(b.snapshot());
});
test('fan shot allows all five pellets on one target; siege uses 50 per pellet on every shell with 19.2m/24m reach',()=>{
 for(const [tier,damage,range] of [[3,35,19.2],[5,50,24]]) {
  const {b,p}=scene(tier),z=target(b);z.hp=z.maxHp=10000;
  for(let shell=0;shell<4;shell++) {
   delete b.pve.scatterMarks?.[z.id];z.x=-4;const hp=z.hp;b.events=[];assert.equal(b.shoot(p),true);assert.equal(hp-z.hp,damage*5);
   const beams=b.events.filter(e=>e.type==='beam');assert.equal(beams.length,5);
   for(const beam of beams)assert.ok(Math.abs(Math.hypot(beam.to.x-beam.from.x,beam.to.y-beam.from.y,beam.to.z-beam.from.z)-range)<1e-6);
   advance(b,p,p.cooldown);
  }
 }
});
test('second shell marks only after all pellets; teammates gain 15%, refresh does not stack and dead targets stay unmarked',()=>{
 const {b,p}=scene(3),z=target(b);z.hp=z.maxHp=10000;
 b.shoot(p);assert.equal(b.pve.scatterMarks?.[z.id],undefined);advance(b,p,18);
 const hp=z.hp;b.shoot(p);assert.equal(hp-z.hp,175);
 assert.deepEqual(b.pve.scatterMarks[z.id],{owner:'p',at:18,until:258});
 const markedHp=z.hp;b.damage(z,100,'ally',{x:z.x,y:1.5,z:z.z});assert.equal(markedHp-z.hp,115);
 advance(b,p,120);const before=z.hp;b.shoot(p);assert.equal(before-z.hp,5*40.25);
 advance(b,p,18);b.shoot(p);assert.equal(b.pve.scatterMarks[z.id].until,b.tick+240);
 b.damage(z,100000,'ally',{x:z.x,y:1.5,z:z.z});assert.equal(b.pve.scatterMarks[z.id],undefined);
 const dead=target(b);dead.hp=1;advance(b,p,120);b.shoot(p);advance(b,p,18);target(b).hp=1;b.shoot(p);
 assert.equal(b.pve.scatterMarks[dead.id],undefined);
});
test('breach knocks back once by 1.5m or slows immovable targets 40% for 90 ticks, never adds damage',()=>{
 for(const type of ['bucket','boss','titan']) {
  const {b,p}=scene(4),z=target(b,-4,type);z.hp=z.maxHp=10000;
  const hp=z.hp;b.shoot(p);assert.equal(hp-z.hp,175);
  if(type==='bucket'){assert.equal(z.x,-5.5);assert.equal(b.pve.scatterSlows?.[z.id],undefined);}
  else {
   assert.equal(z.x,-4);assert.deepEqual(b.pve.scatterSlows[z.id],{owner:'p',at:0,until:90});
   z.heading=Math.PI/2;z.speed=0;
   for(let i=0;i<40;i++){b.tick++;b.tickEntity(z,{forward:true});}
   assert.ok(Math.abs(z.speed-C.unitSpec(z).speed*.6)<1e-6);
  }
 }
});
test('switch away/back preserves the partial magazine and halfway reload; idle never fills the first shell',()=>{
 const {b,p}=scene();b.shoot(p);advance(b,p,300);assert.equal(p.ammo,1);
 choose(b,p,'rapid');choose(b,p,'standard');assert.equal(p.ammo,1);assert.equal(p.charge,0);assert.equal(p.criticalProgress,0);
 assert.equal(b.shoot(p),true);assert.equal(p.ammo,0);assert.equal(p.cooldown,120);
 advance(b,p,60);choose(b,p,'rapid');choose(b,p,'standard');assert.equal(p.ammo,0);assert.equal(p.cooldown,60);
 assert.equal(b.shoot(p),false);advance(b,p,59);assert.equal(b.shoot(p),false);advance(b,p,1);assert.equal(p.ammo,2);
 const copy=scene().b;copy.restore(b.snapshot());assert.deepEqual(copy.snapshot(),b.snapshot());S.validateSnapshot(b.snapshot());
});
test('checkpoint rejects forged vulnerability provenance/timers and incompatible magazine/charge states',()=>{
 const {b,p}=scene(),z=target(b);b.shoot(p);advance(b,p,18);z.hp=z.maxHp;b.shoot(p);
 S.validateSnapshot(b.snapshot());assert.ok(b.pve.scatterMarks[z.id]);
 for(const mutate of [s=>s.pve.scatterMarks[z.id].owner='ally',s=>s.pve.scatterMarks[z.id].until++,
  s=>s.pve.scatterMarks[z.id].at=s.tick+1,s=>s.pve.scatterMarks[z.id].stacks=2,
  s=>s.entities.find(e=>e.id==='p').charge=1,s=>s.entities.find(e=>e.id==='p').criticalProgress=1,
  s=>{const e=s.entities.find(e=>e.id==='p');e.ammo=0;e.cooldown=0;},s=>s.pve.scatterSlows[z.id]={owner:'p',at:s.tick,until:s.tick+90}]) {
  const bad=b.snapshot();mutate(bad);assert.throws(()=>S.validateSnapshot(bad));
 }
 choose(b,p,'rapid');S.validateSnapshot(b.snapshot());
 for(const mutate of [s=>delete s.pve.magazines.p.standard,s=>s.pve.magazines.p.standard.ammo=3,
  s=>s.pve.magazines.p.standard.cooldown=121,s=>s.pve.magazines.unknown={}]) {
  const bad=b.snapshot();mutate(bad);assert.throws(()=>S.validateSnapshot(bad));
 }
});
test('acquiring shotgun clears stored charge and in-flight cannon hits cannot recharge its replaced critical system',()=>{
 const {b,p}=scene(1),z=target(b);b.shoot(p);const old=b.bullets[0];assert.ok(old);
 choose(b,p,'shrapnel');assert.equal(p.criticalProgress,0);assert.equal(p.charge,0);
 b.resolveHit({kind:'tank',id:z.id,point:{x:z.x,y:1.5,z:z.z}},old);
 assert.equal(p.criticalProgress,0);S.validateSnapshot(b.snapshot());
});
test('real Authority fire cadence, halfway reload checkpoint and Replica retain ammo through death and resupply',()=>{
 const {b,p,u}=scene();u.haste=3;
 const a=new S.Authority(),r=new S.Replica();a.battle=b;r.welcome(a.attach('peer','p'));
 const shotTicks=[];
 for(let i=0;i<79;i++) {
  a.commands.set('p',{fire:true});a.peers.get('peer').lastTick=b.tick;a.step();
  for(const event of b.events)if(event.type==='shot'&&event.id==='p')shotTicks.push(b.tick);
  S.validateSnapshot(b.snapshot());const result=r.receive(a.statePacket({network:true}));assert.equal(result.ok,true,result.reason);
 }
 assert.deepEqual(shotTicks,[1,19]);assert.equal(p.ammo,0);assert.equal(p.cooldown,60);
 const copy=scene().b;copy.restore(b.snapshot());
 for(let i=0;i<60;i++){b.step({p:{}});copy.step({p:{}});assert.deepEqual(copy.snapshot(),b.snapshot());}
 assert.equal(p.ammo,2);
 b.shoot(p);const z=target(b);b.damage(p,100000,z.id,{x:p.x,y:1.5,z:p.z});assert.equal(p.alive,false);
 const ammo=p.ammo,cooldown=p.cooldown;b.damage(z,100000,'ally',{x:z.x,y:1.5,z:z.z});b.pve.nextWaveAt=0;b.step();
 assert.equal(p.alive,true);assert.equal(p.ammo,ammo);assert.equal(p.cooldown,cooldown);S.validateSnapshot(b.snapshot());
});
module.exports={scene,target,choose,advance};