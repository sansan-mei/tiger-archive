const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js');
function make(tankType='medium'){const map=C.clone(C.MAP);map.obstacles=[];map.pickups=[];const b=new C.Battle({map,participants:[{id:'a',controller:'human',tankType,weaponType:'standard',spawn:0},{id:'b',controller:'human',tankType:'medium',weaponType:'standard',spawn:1}]});b.start();return b;}
test('shields absorb overflow before armour, regen after five quiet seconds and pause freezes regen',()=>{
 const b=make(),a=b.entities[0];b.damage(a,110,'b',a);assert.equal(a.shield,0);assert.equal(a.hp,190);
 for(let i=0;i<299;i++)b.step();assert.equal(a.shield,0);b.pause();b.step();assert.equal(a.shield,0);b.start();b.step();assert.ok(a.shield>0);
 b.damage(a,1,'b',a);const shield=a.shield;for(let i=0;i<299;i++)b.step();assert.equal(a.shield,shield);for(let i=0;i<361;i++)b.step();assert.equal(a.shield,90);assert.ok(a.hp<190);
});
test('dash moves about thirteen metres, can fire and respects a wall and ramp sides',()=>{
 const b=make('light'),a=b.entities[0];const z=a.z;const events=b.step({a:{ability:true,fire:true}});assert.ok(events.some(e=>e.type==='shot'));for(let i=0;i<29;i++)b.step({a:{ability:true}});assert.ok(Math.abs(z-a.z-13)<.01);
 b.map.obstacles=[{id:'block',floor:0,x:0,z:35,w:12,d:2,h:4}];for(let i=0;i<120;i++)b.step({a:{forward:true}});assert.ok(a.z>38);
 Object.assign(a,{x:-26,z:16,heading:0,speed:0,abilityCooldown:0,abilityHeld:false});for(let i=0;i<30;i++)b.step({a:{ability:true}});assert.ok(a.x>-30,'cannot dash through ramp sides');
});
test('held skill does not retrigger, barrier absorbs damage then expires and cooldown persists',()=>{
 const b=make(),a=b.entities[0];b.step({a:{ability:true}});assert.equal(a.barrier,60);b.damage(a,80,'b',a);assert.equal(a.shield,70);assert.equal(a.hp,210);
 let events=[];for(let i=0;i<750;i++)events.push(...b.step({a:{ability:true}}));assert.equal(events.filter(e=>e.type==='ability').length,0);assert.equal(a.barrier,0);
 b.step();assert.ok(b.step({a:{ability:true}}).some(e=>e.type==='ability'));assert.equal(a.barrier,60);
});
test('deploy reduces only frontal damage, follows turret and slows movement',()=>{
 const b=make('heavy'),a=b.entities[0];b.step({a:{ability:true,forward:true}});a.aim=0;
 b.damage(a,30,'b',a,{x:1,z:0});assert.equal(a.shield,111);
 b.damage(a,30,'b',a,{x:-1,z:0});assert.equal(a.shield,81);
 a.aim=Math.PI/2;b.damage(a,30,'b',a,{x:0,z:-1});assert.equal(a.shield,72);
 for(let i=0;i<60;i++)b.step({a:{forward:true}});assert.ok(a.speed<=C.TANKS.heavy.speed*.35+.001);
});
test('ability and shield state survives authority/replica and checkpoint continuation',()=>{
 for(const tankType of Object.keys(C.TANKS)){
  const session=new S.LocalSession({participants:C.defaultParticipants({tankType,weaponType:'standard'}).map(p=>({...p,controller:'human'}))});session.start();
  const events=session.advance(1/60,{ability:true});assert.ok(events.some(e=>e.type==='ability'));S.validateSnapshot(session.current());
  const b=session.authority.battle,copy=new C.Battle();copy.restore(b.snapshot());for(let i=0;i<90;i++)assert.deepEqual(b.step(),copy.step());assert.deepEqual(b.snapshot(),copy.snapshot());
  const bad=b.snapshot();bad.entities[0].shield=99999;assert.throws(()=>S.validateSnapshot(bad));assert.throws(()=>C.normalizeInput({ability:1}));
 }
});
test('continuous full-power weapon hits meet the 2/3/4 laser baseline and balanced cannon counts',()=>{
 const expected={laser:[2,3,4],standard:[6,9,12],rapid:[23,34,45]};
 for(const [weaponType,counts] of Object.entries(expected))for(const [i,tankType] of ['light','medium','heavy'].entries()){
  const map=C.clone(C.MAP);map.obstacles=[];map.pickups=[];
  const b=new C.Battle({map,participants:[{id:'a',controller:'human',tankType:'medium',weaponType,spawn:0},{id:'b',controller:'human',tankType,weaponType:'standard',spawn:1}]});b.start();
  const [a,target]=b.entities;Object.assign(a,{x:0,z:30});Object.assign(target,{x:0,z:-20});let hits=0;
  for(let tick=0;tick<1800&&target.alive;tick++){
   const events=b.step({a:{fire:!a.needsRelease}});
   for(const event of events)if(event.type==='damage'&&event.id==='b'){
    hits++;assert.equal(target.alive,hits<counts[i],weaponType+' / '+tankType+' at hit '+hits);
   }
  }
  assert.equal(hits,counts[i],weaponType+' / '+tankType);assert.equal(target.alive,false);
 }
});
