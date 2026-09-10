const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js');
function battle(){const b=new C.Battle({participants:C.defaultParticipants().slice(0,2).map(p=>({...p,controller:'human'}))});b.start();return b;}
test('death respawns after four seconds, preserves score and grants cancellable protection',()=>{
 const b=battle(),[a,v]=b.entities;b.damage(v,999,a.id,v);assert.equal(v.deaths,1);assert.equal(a.kills,1);
 for(let i=0;i<239;i++)b.step();assert.equal(v.alive,false);b.step();assert.equal(v.alive,true);assert.equal(v.hp,v.maxHp);assert.equal(v.deaths,1);
 assert.equal(b.damage(v,50,a.id,v),false);assert.equal(b.shoot(v),true);assert.equal(b.damage(v,50,a.id,v),true);S.validateSnapshot(b.snapshot());
});
test('occupied spawn points postpone respawn, forfeited players never return',()=>{
 const b=battle(),v=b.entities[1];b.damage(v,999,'p1',v);b.tick=v.respawnAt-1;const valid=b.valid.bind(b);b.valid=()=>false;b.step();assert.equal(v.alive,false);
 b.valid=valid;v.forfeited=true;b.step();assert.equal(v.alive,false);assert.equal(b.status,'finished');assert.equal(b.winnerId,'p1');
});
test('fifteenth kill ends the match once; timer tie is a draw and lower deaths break ties',()=>{
 const b=battle();b.entities[0].kills=14;b.damage(b.entities[1],999,'p1',b.entities[1]);assert.equal(b.step().filter(e=>e.type==='end').length,1);assert.equal(b.winnerId,'p1');assert.deepEqual(b.step(),[]);
 for(const deaths of [0,1]){const t=battle();t.tick=C.RULES.duration-1;t.entities[1].deaths=deaths;t.step();assert.equal(t.status,'finished');assert.equal(t.winnerId,deaths?'p1':null);}
});
test('repair and boost are authoritative, respect height, refresh after 20 seconds and survive restore',()=>{
 const b=battle(),a=b.entities[0],repair=b.pickups[0],boost=b.pickups[1];
 b.pickups.find(p=>p.id==='repair-1').readyAt=1000;Object.assign(a,{x:repair.x,z:repair.z,floor:1,y:8,hp:30});b.step();assert.equal(a.hp,30);
 Object.assign(a,{floor:0,y:0});b.step();assert.equal(a.hp,75);assert.equal(repair.readyAt,b.tick+1200);b.step();assert.equal(a.hp,75);
 Object.assign(a,{x:boost.x,z:boost.z});b.step();assert.equal(a.boostUntil,b.tick+360);
 for(let i=0;i<60;i++)b.step({p1:{forward:true}});assert.ok(a.speed>C.TANKS[a.tankType].speed);S.validateSnapshot(b.snapshot());
 const copy=battle();copy.restore(b.snapshot());for(let i=0;i<400;i++)assert.deepEqual(b.step(),copy.step());assert.deepEqual(b.snapshot(),copy.snapshot());
 b.tick=repair.readyAt;Object.assign(a,{x:repair.x,z:repair.z,hp:30});b.step();assert.equal(a.hp,75);
});
test('all hulls have usable spawns, supplies and two reachable ramps per level connection',()=>{
 for(const tankType of Object.keys(C.TANKS)){
  const b=battle(),a=b.entities[0];a.tankType=tankType;
  for(const s of C.MAP.spawns)assert.ok(b.valid(s.x,s.z,s.floor,a,{ignoreEntities:true}));
  for(const s of C.MAP.pickups)assert.ok(b.valid(s.x,s.z,s.floor,a,{ignoreEntities:true}));
  for(const r of C.MAP.ramps)for(const [from,to] of [[r.a,r.b],[r.b,r.a]]){
   const z=from.z-Math.sign(to.z-from.z)*4;assert.ok(b.valid(from.x,z,from.floor,a,{ignoreEntities:true}));
  }
 }
});
test('replicas reject forged supply definitions and invalid respawn counters',()=>{
 const b=battle();for(const mutate of [s=>s.pickups[0].x++,s=>s.entities[0].respawnAt=-1,s=>s.entities[0].boostUntil=Infinity]){const s=b.snapshot();mutate(s);assert.throws(()=>S.validateSnapshot(s));}
});
