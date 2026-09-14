const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js');
function make(tier){
 const b=new C.Battle({mode:'pve',participants:[{id:'p',controller:'human',tankType:'human',weaponType:'pistol'}]});b.start();b.pve.nextWaveAt=100000;
 const p=b.entities[0];Object.assign(p,{weaponType:'laser',ammo:0,x:0,z:55,aim:0,pitch:0,protectedUntil:0});
 for(const k of ['wideBeam','capacitor','plasmaBurst','refraction','stellar'].slice(0,tier))b.pve.upgrades.p[k]=1;
 return {b,p};
}
test('stellar acquisition clamps an existing warmup before snapshot delivery',()=>{
 const {b,p}=make(4);for(let i=0;i<60;i++)b.step({p:{fire:true}});
 b.pve.pending.p=1;b.pve.choices.p=['stellar','haste','regen'];b.pve.choiceIds.p=b.pve.nextChoiceId++;
 assert.equal(b.chooseUpgrade('p',0,'stellar'),true);S.validateSnapshot(b.snapshot());
 assert.equal(p.charge,45);b.step({p:{fire:true}});assert.equal(b.events.filter(e=>e.type==='beam').length,1);
});
test('stellar alone auto-fires after 45 ticks with valid snapshots; lower tiers retain 90',()=>{
 for(const tier of [0,4,5]){
  const {b,p}=make(tier),ticks=tier===5?45:90;
  for(let i=1;i<=ticks;i++){
   b.step({p:{fire:true}});S.validateSnapshot(b.snapshot());
   const beams=b.events.filter(e=>e.type==='beam');
   if(i<ticks)assert.equal(beams.length,0);
   else assert.equal(beams.length,1,`tier ${tier} fires at tick ${ticks}`);
  }
  assert.equal(b.pveWeapon(p).cooldown,102);
  const authority=new S.Authority();authority.battle=b;
  const replica=new S.Replica();replica.welcome(authority.attach('peer','p'));
  assert.equal(replica.receive(authority.statePacket({network:true})).ok,true);
 }
});
