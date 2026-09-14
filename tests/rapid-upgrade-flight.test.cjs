const {test}=require('node:test');
test('rapid airborne lower-tier round survives the final upgrade and replica delivery',()=>{
const assert=require('node:assert/strict');
const root=require('node:path').resolve(__dirname,'..');
const C=require(root+'/battle-core.js'),S=require(root+'/battle-session.js');
const b=new C.Battle({mode:'pve',participants:[{id:'p',controller:'human',tankType:'human',weaponType:'pistol'}]});
b.start();b.pve.nextWaveAt=100000;b.pve.wave=4;
for(const e of b.entities.filter(e=>e.tankType==='zombie'))e.maxHp=C.PVE.healthFor(e.zombieType,1,4);
const p=b.entities[0];Object.assign(p,{weaponType:'rapid',x:0,z:55,y:0,floor:0,aim:0,pitch:0,protectedUntil:0,ammo:0});
const u=b.pve.upgrades.p;for(const k of ['suppression','bipod','piercingBelt','guardPlate'])u[k]=1;
b.pve.branchState.p.deploy=90;
S.validateSnapshot(b.snapshot());b.shoot(p);
assert.equal(b.bullets.length,1);assert.equal(b.bullets[0].damage,21);S.validateSnapshot(b.snapshot());
// Acquire the legal final route node while a prior-tier round is still airborne.
b.pve.pending.p=1;b.pve.choices.p=['fortress','haste','regen'];b.pve.choiceIds.p=b.pve.nextChoiceId++;
assert.equal(b.chooseUpgrade('p',0,'fortress'),true);
assert.equal(b.bullets[0].damage,21);
S.validateSnapshot(b.snapshot());
const a=new S.Authority();a.battle=b;const r=new S.Replica();r.welcome(a.attach('peer','p'));
const received=r.receive(a.statePacket({network:true}));assert.equal(received.ok,true,received.reason);


});
