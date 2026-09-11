const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../battle-core.js');
const S = require('../battle-session.js');
const { RoomServer } = require('../room-server.js');
const participants = (count = 1) => Array.from({length: count}, (_, i) => ({id: 'p' + i, controller: 'human', tankType: 'heavy', weaponType: 'rocket', spawn: i}));
const create = (count = 1) => { const b = new C.Battle({mode:'pve', participants:participants(count)}); b.start(); return b; };
const enemies = (b) => b.entities.filter(e => e.tankType === 'zombie');
function clearWave(b) {
  b.pve.wave = Math.max(1, b.pve.wave);
  b.pve.nextWaveAt = 0; b.pve.queue = 0;
  for (const z of enemies(b)) { z.protectedUntil = 0; if (z.alive) b.damage(z, 1000, b.entities[0].id, z); }
  b.step();
  if (!b.pve.choices[b.entities[0].id]) C.PVE.progression.addExperience(b, C.PVE.progression.xpNeeded(b.pve.level), C.PVE.rewards);
}
test('rounds last eight minutes; solo PvE starts as human+pistol and never wins at 15 kills', () => {
  assert.equal(C.RULES.duration, 8 * 60 * C.TICK_RATE);
  assert.throws(() => new C.Battle({participants:participants()}));
  const b=create(), p=b.entities[0];
  assert.equal(p.tankType, 'human'); assert.equal(p.weaponType,'pistol'); assert.equal(p.hp,80);
  assert.equal(enemies(b).length,16); assert.ok(enemies(b).every(e=>!e.alive));
  p.kills=15; b.step(); assert.equal(b.status,'playing');
  assert.throws(()=>new C.Battle({participants:[{...participants()[0],tankType:'zombie'},...participants(2).slice(1)]}));
  b.tick = C.RULES.duration-1; b.step(); assert.equal(b.pve.result,'defeat');
  assert.equal(b.status,'finished'); S.validateSnapshot(b.snapshot());
});
test('PvE prevents direct, self and splash friendly fire while retaining zombie damage', () => {
  const b=create(2), [p, ally]=b.entities, z=enemies(b)[0];
  Object.assign(p,{x:20,z:50,aim:0}); Object.assign(ally,{x:17,z:50});
  Object.assign(z,{x:13,z:50,y:0,floor:0,hp:80,alive:true});
  assert.equal(b.damage(ally,100,p.id,ally),false);
  assert.equal(b.damage(p,100,p.id,p),false);
  assert.equal(b.collision({x:20,y:2,z:50},{x:10,y:2,z:50},p.id).id,z.id);
  b.resolveHit({kind:'tank',id:z.id,point:{x:13,y:1.5,z:50}},
    {owner:p.id,ownerLife:0,weaponType:'rocket',damage:20,critical:false,dx:-1,dy:0,dz:0});
  assert.equal(z.alive,false); assert.equal(ally.hp,80); assert.equal(p.hp,80); assert.equal(p.kills,1);
});
test('zombies close distance and melee at one-second intervals without projectiles or skills', () => {
  const b=create(), p=b.entities[0], z=enemies(b)[0];
  Object.assign(p,{x:0,z:55}); Object.assign(z,{x:8,z:55,y:0,floor:0,alive:true,hp:80,heading:0});
  b.pve.nextWaveAt = 100000; b.pve.wave=1;
  for(let i=0;i<200;i++) b.step();
  assert.ok(z.x<3, String(z.x)); assert.ok(p.hp<80); assert.equal(b.bullets.length,0); assert.equal(z.abilityUntil,0);
  const hp=p.hp; for(let i=0;i<59;i++) b.step(); assert.ok(hp-p.hp<=10);
  S.validateSnapshot(b.networkSnapshot(),{network:true});
});
test('a zombie pack spreads around one target instead of forming a single-file traffic jam', () => {
  const b=create(),p=b.entities[0],pack=enemies(b).slice(0,6),attackers=new Set();
  Object.assign(p,{x:0,z:55,hp:10000,maxHp:10000,protectedUntil:0});
  b.pve.nextWaveAt=100000;b.pve.queue=0;b.pve.wave=6;
  for(const [i,z] of pack.entries())Object.assign(z,{x:8+i*1.7,z:55,y:0,floor:0,alive:true,hp:80,maxHp:80,
    protectedUntil:0,heading:0,zombieType:'walker',brain:{target:null,path:[],pathTick:0,blocked:0}});
  for(let i=0;i<600;i++)for(const event of b.step())
    if(event.type==='damage'&&event.id===p.id)attackers.add(event.owner);
  assert.ok(attackers.size>=3,[...attackers].join(','));
  assert.ok(pack.filter(z=>Math.hypot(z.x-p.x,z.z-p.z)<2.2).length>=3);
});
test('wave rewards are validated once, persist and affect authority cooldown, healing and area damage', () => {
  const b=create(), p=b.entities[0]; clearWave(b);
  assert.equal(b.pve.choices[p.id].length,3);
  assert.equal(b.chooseUpgrade(p.id,0,'haste'),false);
  assert.equal(b.chooseUpgrade('other',1,'haste'),false);
  b.pve.choices[p.id]=['haste','regen','nova'];
  assert.equal(b.chooseUpgrade(p.id,1,'haste'),true);
  assert.equal(b.chooseUpgrade(p.id,1,'haste'),false);
  b.shoot(p); assert.equal(p.cooldown,22);
  b.pve.upgrades[p.id].regen=2; p.hp=50; b.tick=59; b.step(); assert.equal(p.hp,52);
  const z=enemies(b)[0]; Object.assign(p,{x:0,z:55}); Object.assign(z,{x:4,z:55,y:0,floor:0,hp:80,alive:true});
  b.pve.upgrades[p.id].nova=2; b.tick=239; b.step(); assert.equal(z.hp,40);
  S.validateSnapshot(b.snapshot());
  const recovered=create(); recovered.restore(b.snapshot());
  for(let i=0;i<120;i++){b.step(); recovered.step();} assert.deepEqual(recovered.snapshot(),b.snapshot());
});
test('clear waves revive teammates; all dead loses and never uses PvP respawn', () => {
  const b=create(2), [a,other]=b.entities;
  b.damage(other,1000,null,other); assert.equal(other.respawnAt,0);
  b.pve.nextWaveAt=10000;
  for(let i=0;i<300;i++) b.step(); assert.equal(other.alive,false);
  clearWave(b); assert.equal(other.alive,true); assert.equal(other.hp,80);
  b.damage(a,1000,null,a); other.protectedUntil=0;b.damage(other,1000,null,other);b.step();
  assert.equal(b.pve.result,'defeat'); S.validateSnapshot(b.snapshot());
});
test('eight players and sixteen zombies stay within packet bounds and pass replica validation', () => {
  const a=new S.Authority({mode:'pve', participants:participants(8)}), b=a.battle;
  const replica=new S.Replica();replica.welcome(a.attach('peer','p0'));b.start();
  b.pve.nextWaveAt=1; b.pve.wave=10;
  for(let i=0;i<660;i++){
    a.step();
    if(i%3===0){const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
      assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);
      assert.equal(replica.receive(packet).ok,true, 'tick '+b.tick);
    }
  }
  assert.equal(enemies(b).filter(e=>e.alive).length,16);
  S.validateSnapshot(b.snapshot());
  for(const mutate of [s=>s.pve.upgrades.p0.haste=999,s=>s.pve.queue=1000,s=>s.entities.pop(),s=>s.pve.choices.p0=['injected']]){
    const bad=b.snapshot();mutate(bad);assert.throws(()=>S.validateSnapshot(bad));
  }
});
test('co-op room starts solo, authenticates upgrades and restores checkpoint/reconnect with mode intact', () => {
  const server=new RoomServer({now:()=>1000}), messages=[];
  const client=server.connect({bufferedAmount:0,send:s=>messages.push(JSON.parse(s)),close:()=>{}});
  const send=(type,extra={})=>server.receive(client,JSON.stringify({type,version:C.VERSION,pluginManifest:C.PLUGIN_MANIFEST,name:'测试',loadout:{tankType:'heavy',weaponType:'rocket'},...extra}));
  send('create',{mode:'pve'}); const joined=messages.findLast(m=>m.type==='joined'), room=server.rooms.get(joined.code);
  assert.equal(server.publicRooms()[0].mode,'pve');assert.deepEqual(room.seats[0].loadout,{tankType:'human',weaponType:'pistol'});
  send('loadout');assert.match(messages.at(-1).message,/固定/);
  send('ready',{ready:true});send('start');assert.equal(room.phase,'playing');
  const b=room.authority.battle, id=room.seats[0].id;
  clearWave(b);const choice=b.pve.choices[id][0];
  send('upgrade',{epoch:0,wave:1,choice});assert.ok(b.pve.choices[id]);
  send('upgrade',{epoch:room.epoch,wave:1,choice,offerId:b.pve.choiceIds[id]});assert.equal(b.pve.choices[id],undefined);
  const copy=new RoomServer({now:()=>2000});copy.restore(server.checkpoint());
  const recovered=copy.rooms.get(room.code);assert.equal(recovered.mode,'pve');
  assert.deepEqual(recovered.authority.battle.pve,b.pve);
  const out=[];const connection=copy.connect({bufferedAmount:0,send:s=>out.push(JSON.parse(s)),close:()=>{}});
  copy.receive(connection,JSON.stringify({type:'resume',version:C.VERSION,pluginManifest:C.PLUGIN_MANIFEST,code:room.code,token:joined.token}));
  assert.equal(out.findLast(m=>m.type==='state').snapshot.mode,'pve');
  S.validateSnapshot(out.findLast(m=>m.type==='state').snapshot,{network:true});
});
test('zombies navigate a real ramp to a survivor on the next floor', () => {
  const b=create(), p=b.entities[0], z=enemies(b)[0];
  Object.assign(p,{x:-36,z:-4,floor:1,y:8});
  Object.assign(z,{x:-36,z:32,floor:0,y:0,hp:80,alive:true,heading:-Math.PI/2,aim:-Math.PI/2});
  b.pve.nextWaveAt=10000; b.pve.wave=1;
  let onRamp=false;
  for(let i=0;i<1600 && z.floor!==1;i++) {
    b.step();onRamp ||= !!z.rampId;
    if(i%60===0) S.validateSnapshot(b.snapshot());
  }
  assert.equal(onRamp,true);assert.equal(z.floor,1);
});
test('leaving during reward selection cannot leave stale choices in the next wave', () => {
  const b=create(2);clearWave(b);
  const leaving=b.entities[1];assert.ok(b.pve.choices[leaving.id]);
  leaving.forfeited=true;b.damage(leaving,1000,null,leaving);
  b.tick=b.pve.nextWaveAt-1;b.step();
  assert.equal(b.pve.choices[leaving.id],undefined);
  assert.equal(b.pve.wave,2);S.validateSnapshot(b.snapshot());
  assert.throws(()=>new C.Battle({mode:'pve',participants:[{...participants()[0],id:'zombie_0'}]}));
});
test('zombie health scales for 1–8 participants and rescales remaining health only on forfeiture', () => {
  for (let n=1;n<=8;n++) {
    const b=create(n), z=enemies(b)[0];
    assert.equal(b.pve.teamSize,n);
    assert.equal(z.maxHp,80*(1+0.25*(n-1)));
    b.pve.nextWaveAt=1;b.step();
    const spawned=enemies(b).find(e=>e.alive);
    assert.equal(spawned.hp,spawned.maxHp);
    assert.equal(spawned.maxHp,C.PVE.healthFor(spawned.zombieType,n));
    S.validateSnapshot(b.snapshot());
  }
  const b=create(4), z=enemies(b)[0];
  b.pve.nextWaveAt=10000;
  Object.assign(z,{alive:true,hp:70});
  b.damage(b.entities[1],1000,null,b.entities[1]);b.step();
  assert.equal(b.pve.teamSize,4);assert.equal(z.maxHp,140);assert.equal(z.hp,70);
  b.entities[1].forfeited=true;b.step();
  assert.equal(b.pve.teamSize,3);assert.equal(z.maxHp,120);assert.equal(z.hp,60);
  const dead=enemies(b)[1];assert.equal(dead.hp,0);assert.equal(dead.alive,false);
  S.validateSnapshot(b.snapshot());
});
test('wave composition progressively unlocks all five enemies with distinct movement and attacks', () => {
  const seen=new Set();
  for (let wave=1;wave<=6;wave++) {
    for(let ordinal=0;ordinal<20;ordinal++) {
      const type=C.PVE.typeFor(wave,ordinal);seen.add(type);
      assert.ok(C.ZOMBIE_SPECS[type].wave<=wave);
      if(wave===1) assert.equal(type,'walker');
    }
  }
  assert.deepEqual([...seen].sort(),Object.keys(C.ZOMBIE_SPECS).filter(k=>k!=="boss").sort());
  for (const [type,spec] of Object.entries(C.ZOMBIE_SPECS).filter(([k])=>k!=="boss")) {
    const b=create(), p=b.entities[0], z=enemies(b)[0];
    b.pve.wave=6;b.pve.nextWaveAt=10000;
    Object.assign(p,{x:0,z:55});
    Object.assign(z,{zombieType:type,maxHp:spec.hp,hp:spec.hp,alive:true,x:8,z:55,y:0,floor:0,heading:0});
    for(let i=0;i<30;i++) b.step();
    assert.ok(Math.abs(z.speed-spec.speed)<0.001,type);
    Object.assign(z,{x:1.9,z:55,speed:0,cooldown:0});
    b.step();assert.equal(p.hp,80-(spec.meleeDamage+12));
    assert.equal(z.cooldown,spec.meleeCooldown-1);
    S.validateSnapshot(b.snapshot());
  }
});
test('scaled variants survive replica and checkpoint replay; forged health/type/team size are rejected', () => {
  const a=new S.Authority({mode:'pve',participants:participants(8)}), b=a.battle;
  const r=new S.Replica();r.welcome(a.attach('peer','p0'));b.start();
  b.pve.wave=6;b.pve.nextWaveAt=1;
  for(let i=0;i<500;i++) a.step();
  assert.ok(enemies(b).some(e=>e.zombieType==='brute'&&e.maxHp===1100));
  const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);
  assert.equal(r.receive(packet).ok,true);
  const copy=create(8);copy.restore(b.snapshot());
  for(let i=0;i<120;i++){b.step();copy.step();}
  assert.deepEqual(copy.snapshot(),b.snapshot());
  for(const mutate of [s=>s.pve.teamSize=9,s=>enemies(s)[0].zombieType='fake',s=>enemies(s)[0].maxHp++,s=>enemies(s)[0].hp=9999]) {
    const invalid=b.snapshot();mutate(invalid);assert.throws(()=>S.validateSnapshot(invalid));
  }
});
