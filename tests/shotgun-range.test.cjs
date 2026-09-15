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
test('shotgun retains close damage, reaches 60% farther and falls off with distance',()=>{
 for(const tier of [3,5]) {
  const samples=[];
  for(const distance of [4,8,12,16,18,20,23,27]) {
   const {b,p}=scene(tier),z=target(b,-distance);z.hp=z.maxHp=100000;
   b.events=[];b.shoot(p);
   const hits=b.events.filter(e=>e.type==='damage'&&e.id===z.id);
   samples.push({distance,hits:hits.length,damage:100000-z.hp,perPellet:hits[0]?.amount||0});
  }
  console.log('distance probe',tier,JSON.stringify(samples));
  assert.equal(samples[0].hits,5);assert.equal(samples[0].damage,tier===5?250:175);
  assert.ok(samples[1].hits>=3,'8m must still land multiple pellets');
  assert.ok(samples[3].damage>0,'16m is not a hard cutoff');
  assert.ok(samples[4].damage>0,'18m remains hittable at both tiers');
  assert.ok(samples[1].perPellet<samples[0].perPellet,'actual distance falloff');
  assert.ok(samples[4].perPellet<samples[1].perPellet);
  if(tier===5)assert.ok(samples[6].damage>0,'final tier reaches 23m');
  else assert.equal(samples[6].damage,0);
  assert.equal(samples[7].damage,0);
 }
});
