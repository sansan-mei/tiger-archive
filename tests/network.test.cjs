const { test } = require("node:test"),
  assert = require("node:assert/strict");
const { RoomServer } = require("../room-server.js"),
  C = require("../battle-core.js"),
  S = require("../battle-session.js");
const { NetworkSession } = require("../network-session.js");
function setup() {
  let now = 0;
  const rooms = new RoomServer({ now: () => now });
  function peer() {
    const messages = [],
      closed = [];
    const transport = {
      bufferedAmount: 0,
      send: (s) => messages.push(JSON.parse(s)),
      close: (...a) => closed.push(a),
    };
    const id = rooms.connect(transport);
    return {
      id,
      messages,
      closed,
      transport,
      last: (type) => messages.findLast((m) => m.type === type),
    };
  }
  function send(p, type, extra = {}) {
    rooms.receive(
      p.id,
      JSON.stringify({
        type,
        version: C.VERSION,
        pluginManifest: C.PLUGIN_MANIFEST,
        name: "测试车长",
        loadout: { tankType: "medium", weaponType: "standard" },
        ...extra,
      }),
    );
  }
  function match(count = 2) {
    const peers = Array.from({ length: count }, peer);
    send(peers[0], "create");
    const code = peers[0].last("joined").code;
    for (const p of peers.slice(1)) send(p, "join", { code });
    for (const p of peers) send(p, "ready", { ready: true });
    send(peers[0], "start");
    return { peers, room: rooms.rooms.get(code), code };
  }
  function tick(n = 1) {
    for (let i = 0; i < n; i++) {
      now += 1000 / 60;
      rooms.advance(1 / 60);
    }
  }
  return {
    rooms,
    peer,
    send,
    match,
    tick,
    setNow: (value) => {
      now = value;
    },
  };
}
const enemies=b=>b.entities.filter(e=>e.tankType==='zombie');
function create(){const b=new C.Battle({mode:'pve',participants:[{id:'p0',controller:'human',tankType:'human',weaponType:'pistol'}]});b.start();return b;}
test('cone throw is warned, travels from authority and stops at solid cover',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:12,z:55,alive:true,zombieType:'cone',hp:C.PVE.healthFor('cone',1,4),
    maxHp:C.PVE.healthFor('cone',1,4),protectedUntil:0});
  Object.assign(b.pve,{wave:4,nextWaveAt:100000,queue:0});
  for(const enemy of enemies(b))if(enemy!==z)enemy.maxHp=C.PVE.healthFor(enemy.zombieType,1,4);
  b.step();
  assert.ok(b.pve.enemyAttacks.some(a=>a.owner===z.id&&a.phase==='warn'));
  const hp=p.hp;
  for(let i=0;i<30;i++)b.step();
  assert.equal(p.hp,hp,'warning is dodgeable before damage');
  S.validateSnapshot(b.snapshot());
  for(const mutate of [a=>a.phase='teleport',a=>a.at=-1,a=>a.tx=1e9,a=>a.owner='p0',
    a=>{a.phase='flight';a.at=b.tick+120;a.x=-20;a.z=55;}]){
    const forged=b.snapshot();mutate(forged.pve.enemyAttacks[0]);
    assert.throws(()=>S.validateSnapshot(forged),/Invalid PvE attack/);
  }
});
test('a naturally cast runner dash hits a wall after the player walks away',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:9.8,z:52.9,protectedUntil:0});
  Object.assign(z,{x:13,z:52.01,alive:true,zombieType:'runner',hp:C.PVE.healthFor('runner',1,6),
    maxHp:C.PVE.healthFor('runner',1,6),protectedUntil:0});
  Object.assign(b.pve,{wave:6,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,6);
  assert.equal(b.sight(z,p),true);
  b.step();assert.equal(b.pve.enemyAttacks[0]?.phase,'warn');
  let stunned=false;
  for(let i=0;i<70;i++){
    b.step({p0:{forward:true,moveYaw:Math.PI/2}});
    S.validateSnapshot(b.snapshot());
    if(b.pve.enemyAttacks[0]?.phase==='stun'){stunned=true;break;}
  }
  assert.equal(stunned,true,'legitimate wall contact triggers the one-second stagger');
  assert.deepEqual(z.brain.path,[]);
});
test('runner dash endpoint contact is dangerous behind the telegraph start',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:5,z:55,alive:true,zombieType:'runner',hp:C.PVE.healthFor('runner',1,6),
    maxHp:C.PVE.healthFor('runner',1,6),protectedUntil:0});
  Object.assign(b.pve,{wave:6,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,6);
  b.step();const a=b.pve.enemyAttacks[0];assert.equal(a.phase,'warn');
  // Position-only contact probe at the point confirmed by independent review; the cast itself is real.
  Object.assign(p,{x:6.2,z:56.13});let dashHits=0;
  for(let i=0;i<55;i++){
    const events=b.step();S.validateSnapshot(b.snapshot());
    for(const e of events)if(e.type==='damage'&&e.id===p.id&&e.owner===z.id&&a.phase==='cooldown')dashHits++;
  }
  assert.equal(dashHits,1,'contact just behind the locked-line start is part of the warned danger zone');
});
test('runner contact at 1.5m lateral offset stays inside the displayed warning corridor',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:5,z:55,alive:true,zombieType:'runner',hp:C.PVE.healthFor('runner',1,6),
    maxHp:C.PVE.healthFor('runner',1,6),protectedUntil:0});
  Object.assign(b.pve,{wave:6,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,6);
  b.step();const warning=b.pve.enemyAttacks[0];assert.equal(warning.phase,'warn');
  p.z=56.5;let dashDamage=0;
  for(let i=0;i<75;i++){
    const events=b.step();S.validateSnapshot(b.snapshot());
    for(const e of events)
      if(e.type==='damage'&&e.id===p.id&&e.owner===z.id&&warning.phase==='cooldown'&&b.tick<=58)dashDamage++;
  }
  assert.ok(dashDamage>0,'offset within 2m is hurt by the dash, not an unrelated later melee');
  S.validateSnapshot(b.snapshot());
});
test('runner warns then commits to its original dash line rather than homing',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:5,z:55,alive:true,zombieType:'runner',hp:C.PVE.healthFor('runner',1,6),
    maxHp:C.PVE.healthFor('runner',1,6),protectedUntil:0,heading:0});
  Object.assign(b.pve,{wave:6,nextWaveAt:100000,queue:0});
  for(const enemy of enemies(b))if(enemy!==z)enemy.maxHp=C.PVE.healthFor(enemy.zombieType,1,6);
  b.step();
  const warning=b.pve.enemyAttacks.find(a=>a.owner===z.id&&a.phase==='warn');
  assert.equal(warning.kind,'runner');
  Object.assign(p,{x:0,z:65});
  for(let i=0;i<75;i++)b.step();
  assert.ok(z.x<5,'runner advanced on fixed x line');
  assert.ok(Math.abs(z.z-55)<3,'runner did not home toward moved target');
  assert.equal(p.hp,80);
  S.validateSnapshot(b.snapshot());
});
test('checkpoint restore keeps a runner dash locked to its cast direction',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:5,z:55,alive:true,zombieType:'runner',hp:C.PVE.healthFor('runner',1,6),
    maxHp:C.PVE.healthFor('runner',1,6),protectedUntil:0});
  Object.assign(b.pve,{wave:6,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,6);
  b.step();Object.assign(p,{x:0,z:65});
  for(let i=0;i<44;i++)b.step();
  assert.equal(b.pve.enemyAttacks[0].phase,'dash');
  const saved=b.snapshot();S.validateSnapshot(saved);
  const copy=create();copy.restore(saved);
  for(let i=0;i<15;i++){b.step();copy.step();}
  assert.deepEqual(copy.snapshot(),b.snapshot());
  assert.equal(p.hp,80);
});
test('checkpoint restore continues an in-flight cone attack deterministically',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0];
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:12,z:55,alive:true,zombieType:'cone',hp:C.PVE.healthFor('cone',1,4),
    maxHp:C.PVE.healthFor('cone',1,4),protectedUntil:0});
  Object.assign(b.pve,{wave:4,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,4);
  for(let i=0;i<60;i++)b.step();
  assert.equal(b.pve.enemyAttacks[0].phase,'flight');
  const saved=b.snapshot();S.validateSnapshot(saved);
  const forged=C.clone(saved);forged.pve.enemyAttacks[0].x+=3;
  assert.throws(()=>S.validateSnapshot(forged),/Invalid PvE attack/);
  const cooldownForge=C.clone(saved);
  Object.assign(cooldownForge.pve.enemyAttacks[0],{phase:'cooldown',at:saved.tick+240,x:20,z:35});
  assert.throws(()=>S.validateSnapshot(cooldownForge),/Invalid PvE attack/);
  const copy=create();copy.restore(saved);
  for(let i=0;i<25;i++){b.step();copy.step();}
  assert.deepEqual(copy.snapshot(),b.snapshot());
});
test('eight-player thirty-two-caster warning packet stays inside wire limits',()=>{
  const a=new S.Authority({mode:'pve',matchId:'warning-stress',participants:Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol',spawn:i}))}),b=a.battle;
  b.start();const r=new S.Replica();r.welcome(a.attach('peer','p0'));
  Object.assign(b.entities[0],{x:0,z:55});
  Object.assign(b.pve,{wave:4,queue:0,nextWaveAt:100000});
  assert.equal(enemies(b).length,33);
  for(const [i,z] of enemies(b).entries()){
    z.maxHp=C.PVE.healthFor(z.zombieType,8,4);
    if(i===32)continue;
    Object.assign(z,{x:12+i*.04,z:55+i*.1,zombieType:'cone',maxHp:C.PVE.healthFor('cone',8,4),
      hp:C.PVE.healthFor('cone',8,4),alive:true,protectedUntil:0});
  }
  a.step();const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
  assert.equal(b.pve.enemyAttacks.length,32);
  assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);
  assert.equal(r.receive(packet).ok,true);
  S.validateSnapshot(b.snapshot());
  b.pve.upgrades.p0.modEmber=1;b.pve.upgrades.p0.modFracture=1;
  for(const z of enemies(b).filter(z=>z.alive))b.pve.moduleStatus[z.id]={
    burnUntil:b.tick+240,burnNext:b.tick+60,burnOwner:'p0',fractureUntil:b.tick+240,fractureOwner:'p0'};
  const combined=a.statePacket({network:true});combined.events=combined.events.slice(-64);
  assert.ok(Buffer.byteLength(JSON.stringify(combined))<65536,'combined warnings and module status fit the room packet');
  const result=r.receive(combined);assert.equal(result.ok,true,result.reason);
  S.validateSnapshot(b.snapshot());
  const previous=b.events.length;
  for(let i=0;i<64;i++)b.emit('impact',{x:0,y:1,z:55});
  a.history.push(...b.events.slice(previous));
  for(let i=0;i<32;i++){
    const player=b.entities[i%8];player.cooldown=0;
    assert.equal(b.shoot(player),true);
  }
  const crowded=a.statePacket({network:true});crowded.events=crowded.events.slice(-64);
  assert.equal(b.bullets.length,32);
  assert.equal(crowded.events.length,64);
  assert.ok(Buffer.byteLength(JSON.stringify(crowded))<65536,'32 enemies, warnings, statuses, shots and events fit the room packet');
  const crowdedResult=r.receive(crowded);assert.equal(crowdedResult.ok,true,crowdedResult.reason);
  S.validateSnapshot(b.snapshot());
});
test('crowded PvE fire zones deliver every authoritative damage event across a room broadcast',()=>{
  for(const zoneCount of [3,12]){
    const t=setup(),peers=Array.from({length:8},t.peer);
    t.send(peers[0],'create',{mode:'pve'});
    const code=peers[0].last('joined').code;
    for(const p of peers.slice(1))t.send(p,'join',{code});
    for(const p of peers)t.send(p,'ready',{ready:true});
    t.send(peers[0],'start');
    const room=t.rooms.rooms.get(code),b=room.authority.battle,roster=enemies(b);
    Object.assign(b.pve,{wave:4,queue:0,nextWaveAt:100000,nextBranchZone:zoneCount+1});
    for(const [i,z] of roster.entries()){
      z.maxHp=C.PVE.healthFor(z.zombieType,8,4);
      if(i===32)continue;
      Object.assign(z,{x:12+i*.02,z:55+i*.02,y:0,floor:0,zombieType:'cone',
        maxHp:C.PVE.healthFor('cone',8,4),hp:C.PVE.healthFor('cone',8,4),alive:true,protectedUntil:0});
    }
    for(let i=0;i<zoneCount;i++){
      const owner=room.seats[i%8].id;
      b.pve.upgrades[owner].blast=1;b.pve.upgrades[owner].napalm=1;
      Object.assign(b.getEntity(owner),{weaponType:"rocket",ammo:0});
      b.pve.branchZones.push({id:i+1,owner,life:0,weapon:"rocket",from:{x:12,y:1.5,z:55},to:{x:12,y:1.5,z:55},radius:5,damage:20,until:240,nextTick:30,spread:false,stacks:{}});
    }
    S.validateSnapshot(b.snapshot());
    t.tick(30);
    S.validateSnapshot(b.snapshot());
    const authoritative=b.events.filter(e=>e.type==='damage'&&e.tick===30).map(e=>e.eventId);
    assert.equal(authoritative.length,zoneCount*32,zoneCount+' actual zones damage all 32 survivors');
    const replica=new S.Replica();replica.welcome(peers[0].last('welcome'));
    const delivered=[],crowded=peers[0].messages.filter(m=>m.type==='state'&&m.snapshot.tick===30);
    for(const packet of peers[0].messages.filter(m=>m.type==='state')){
      assert.ok(Buffer.byteLength(JSON.stringify(packet))<=65536,'each split state packet fits the transport');
      assert.ok(packet.events.length<=256,'each split event list fits Replica validation');
      const received=replica.receive(packet);
      assert.equal(received.ok,true,received.reason);
      delivered.push(...received.events.filter(e=>e.type==='damage'&&e.tick===30).map(e=>e.eventId));
    }
    if(zoneCount===12)assert.ok(crowded.length>1,'384 hits exceed one Replica event list');
    assert.deepEqual(delivered,authoritative,'every authoritative hit is delivered once and in order');
    t.tick(6);
    const repeated=replica.receive(peers[0].last('state'));
    assert.equal(repeated.ok,true,repeated.reason);
    assert.equal(repeated.events.filter(e=>e.type==='damage'&&e.tick===30).length,0,'the next broadcast does not replay damage');
    assert.deepEqual(peers[0].closed,[]);
  }
});

test('a real cone cast, flight and hit remain valid through Authority to Replica',()=>{
  const a=new S.Authority({mode:'pve',matchId:'cone-wire',participants:[{id:'p0',controller:'human',tankType:'human',weaponType:'pistol'}]}),b=a.battle;
  b.start();const r=new S.Replica();r.welcome(a.attach('peer','p0'));
  const p=b.entities[0],z=enemies(b)[0];Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:12,z:55,alive:true,zombieType:'cone',hp:C.PVE.healthFor('cone',1,4),maxHp:C.PVE.healthFor('cone',1,4),protectedUntil:0});
  Object.assign(b.pve,{wave:4,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,4);
  let warned=false,flown=false,damaged=false;
  for(let i=0;i<140;i++){
    a.step();S.validateSnapshot(b.snapshot());
    if(i%6 && i!==139)continue;
    const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
    const result=r.receive(packet);
    assert.equal(result.ok,true,JSON.stringify(result));
    warned ||= result.state?.pve?.enemyAttacks?.some(v=>v.phase==='warn')||r.current.pve.enemyAttacks.some(v=>v.phase==='warn');
    flown ||= r.current.pve.enemyAttacks.some(v=>v.phase==='flight');
    damaged ||= result.events.some(e=>e.type==='damage'&&e.id===p.id&&e.owner===z.id);
  }
  assert.ok(warned&&flown&&damaged,'real cast, flight and damage reached replica');
  S.validateSnapshot(b.snapshot());
});
test('cone projectile hits an exposed player once and cannot pass solid cover',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0],wave=4;
  // A fixed rock fixture keeps this attack test independent of the selected map.
  b.map.obstacles=C.clone(C.MAP.obstacles.filter(o=>o.floor===0));delete b.map.terrain;
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:12,z:55,zombieType:'cone',alive:true,protectedUntil:0,
    hp:C.PVE.healthFor('cone',1,wave),maxHp:C.PVE.healthFor('cone',1,wave)});
  Object.assign(b.pve,{wave,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,wave);
  b.step();let hits=0;
  for(let i=0;i<140;i++)for(const e of b.step())if(e.type==='damage'&&e.id===p.id&&e.owner===z.id)hits++;
  assert.equal(hits,1,'one throw, one hit');
  const a=b.pve.enemyAttacks.find(v=>v.owner===z.id);
  // Synthetic collision-only probe: a real cast requires sight, so this teleported flight is not a valid checkpoint.
  Object.assign(z,{x:13,z:47});
  Object.assign(a,{phase:'flight',at:b.tick+120,x:13,z:47,tx:3,tz:47});
  const before=p.hp;
  for(let i=0;i<35&&a.phase==='flight';i++)b.step();
  assert.equal(a.phase,'cooldown','projectile hits spawn rock before the player');
  assert.equal(p.hp,before);
});
test('runner dash hits once up close and recovers from a rock collision',()=>{
  const b=create(),p=b.entities[0],z=enemies(b)[0],wave=6;
  // A fixed rock fixture keeps this attack test independent of the selected map.
  b.map.obstacles=C.clone(C.MAP.obstacles.filter(o=>o.floor===0));delete b.map.terrain;
  Object.assign(p,{x:0,z:55,protectedUntil:0});
  Object.assign(z,{x:5,z:55,zombieType:'runner',alive:true,protectedUntil:0,
    hp:C.PVE.healthFor('runner',1,wave),maxHp:C.PVE.healthFor('runner',1,wave)});
  Object.assign(b.pve,{wave,queue:0,nextWaveAt:100000});
  for(const e of enemies(b))if(e!==z)e.maxHp=C.PVE.healthFor(e.zombieType,1,wave);
  b.step();let dashHits=0;
  for(let i=0;i<70;i++)for(const e of b.step())if(e.type==='damage'&&e.id===p.id&&e.owner===z.id&&e.tick<60)dashHits++;
  assert.equal(dashHits,1,'locked dash hurts stationary player only once');
  const a=b.pve.enemyAttacks.find(v=>v.owner===z.id);
  Object.assign(z,{x:13,z:47,heading:0,abilityUntil:b.tick+15});
  Object.assign(z.brain,{path:[{x:9,z:47}],pathTick:b.tick+1000,target:p.id});
  Object.assign(a,{phase:'dash',castTick:b.tick-42,at:b.tick+15,ox:13,oz:47,x:13,z:47,tx:9,tz:47});
  for(let i=0;i<20&&a.phase==='dash';i++)b.step();
  assert.equal(a.phase,'stun','solid cover cancels dash');
  assert.deepEqual(z.brain.path,[],'wall stun clears stale route');
  S.validateSnapshot(b.snapshot());
});
test('PvE risk is automatic after recovery and legacy trial commands are rejected',()=>{
  const ctx=setup(),host=ctx.peer(),guest=ctx.peer();
  ctx.send(host,'create',{mode:'pve'});const room=ctx.rooms.rooms.get(host.last('joined').code);
  ctx.send(guest,'join',{code:room.code});
  for(const peer of [host,guest])ctx.send(peer,'ready',{ready:true});
  ctx.send(host,'start');const b=room.authority.battle;
  b.pve.wave=4;b.pve.queue=0;b.pve.nextWaveAt=0;
  for(const z of b.entities.filter(e=>e.tankType==='zombie'))z.maxHp=C.PVE.healthFor(z.zombieType,2,4);
  b.step();assert.equal(b.pve.trial,undefined);
  ctx.send(guest,'trial',{epoch:room.epoch,wave:4,choice:'risk'});
  assert.equal(b.pve.trial,undefined);assert.equal(guest.last('error').type,'error');
  ctx.send(host,'trial',{epoch:room.epoch-1,wave:4,choice:'risk'});
  assert.equal(b.pve.trial,undefined);
  ctx.send(host,'trial',{epoch:room.epoch,wave:4,choice:'risk'});
  assert.equal(b.pve.trial,undefined);
  const recovered=new RoomServer({now:()=>0});recovered.restore(ctx.rooms.checkpoint());
  const restored = recovered.rooms.get(room.code).authority.battle;
  restored.tick=restored.pve.nextWaveAt-1;restored.step();
  assert.equal(restored.pve.riskyWave,5);
  ctx.send(host,'trial',{epoch:room.epoch,wave:4,choice:'safe'});
  assert.equal(b.pve.trial,undefined);
  const scheduled=b.pve.nextWaveAt;
  ctx.send(guest,'startWave',{epoch:room.epoch,wave:4});
  assert.match(guest.last('error').message,/未知消息/);
  ctx.send(host,'startWave',{epoch:room.epoch,wave:4});
  assert.match(host.last('error').message,/未知消息/);
  assert.equal(b.pve.nextWaveAt,scheduled);
  b.tick=scheduled-1;
  b.step();assert.equal(b.pve.wave,5);assert.equal(b.pve.riskyWave,5);
  S.validateSnapshot(b.snapshot());
});
test("PvE room has no wall-clock defeat while the PvP watchdog remains fifteen minutes", () => {
  const pve = setup(), host = pve.peer();
  pve.send(host, "create", { mode: "pve" });
  const room = pve.rooms.rooms.get(host.last("joined").code);
  pve.send(host, "ready", { ready: true });
  pve.send(host, "start");
  assert.equal(room.phase, "playing");
  pve.setNow(room.startedAt + 60*60*1000);
  pve.rooms.advance(1 / 60);
  assert.equal(room.phase, "playing", "PvE must not fail after the old wall-clock deadline");
  assert.equal(room.authority.battle.status, "playing");
  assert.equal(room.authority.battle.pve.result, null);
  S.validateSnapshot(room.authority.battle.snapshot());

  const pvp = setup(), { room: versus } = pvp.match();
  pvp.setNow(versus.startedAt + 900001);
  pvp.rooms.advance(1 / 60);
  assert.equal(versus.phase, "finished", "PvP room watchdog must remain fifteen minutes");
});
test("8-player ready room starts one authority and rejects a ninth player", () => {
  const t = setup(),
    peers = Array.from({ length: 9 }, t.peer);
  t.send(peers[0], "create");
  const code = peers[0].last("joined").code;
  for (const p of peers.slice(1, 8)) t.send(p, "join", { code });
  t.send(peers[8], "join", { code });
  assert.match(peers[8].last("error").message, /已满/);
  t.send(peers[1], "start");
  assert.match(peers[1].last("error").message, /房主/);
  t.send(peers[0], "start");
  assert.match(peers[0].last("error").message, /准备/);
  for (const p of peers.slice(0, 8)) t.send(p, "ready", { ready: true });
  t.send(peers[0], "start");
  t.tick(6);
  const room = t.rooms.rooms.get(code);
  assert.equal(room.authority.battle.entities.length, 8);
  const states = peers.slice(0, 8).map((p) => {
    const r = new S.Replica();
    r.welcome(p.last("welcome"));
    assert.equal(r.receive(p.last("state")).ok, true);
    return r.current;
  });
  states.forEach((s) => assert.deepEqual(s, states[0]));
  assert.ok(states[0].entities.every((e) => e.controller === "human"));
});
test("state broadcast serializes one packet once for every room member", () => {
  const t = setup(),
    peers = [t.peer(), t.peer()];
  t.send(peers[0], "create");
  const code = peers[0].last("joined").code;
  t.send(peers[1], "join", { code });
  let serialized = 0;
  t.rooms.packet = () => ({
    toJSON() {
      serialized++;
      return { type: "state", snapshot: {} };
    },
  });
  t.rooms.broadcastState(t.rooms.rooms.get(code));
  assert.equal(serialized, 1);
  assert.equal(peers[0].last("state").type, "state");
  assert.equal(peers[1].last("state").type, "state");
});
test("loadout invalidates ready; versions and unknown rooms cannot enter", () => {
  const t = setup(),
    p = t.peer();
  t.send(p, "create", { pluginManifest: "wrong" });
  assert.equal(t.rooms.rooms.size, 0);
  t.send(p, "join", { code: "ABCDEF" });
  assert.match(p.last("error").message, /不存在/);
  t.send(p, "create");
  t.send(p, "ready", { ready: true });
  t.send(p, "loadout", { loadout: { tankType: "heavy", weaponType: "laser" } });
  assert.equal(p.last("room").players[0].ready, false);
  assert.equal(p.last("room").players[0].weaponType, "laser");
});
test("short fire press/release survives receipt within one simulation tick", () => {
  const t = setup(),
    { peers, room } = t.match(),
    p = peers[0],
    w = p.last("welcome");
  function input(seq, fire) {
    t.rooms.receive(
      p.id,
      JSON.stringify({
        version: C.VERSION,
        type: "input",
        matchId: w.matchId,
        epoch: w.epoch,
        connection: w.connection,
        seq,
        clientTick: 0,
        input: { fire },
      }),
    );
  }
  input(0, true);
  input(1, false);
  t.tick(2);
  assert.equal(
    room.authority.history.filter((e) => e.type === "shot").length,
    1,
  );
  assert.equal(room.authority.battle.getEntity(w.entityId).fireHeld, false);
});
test("disconnect clears control, token resumes seat, expired seat is eliminated and host migrates", () => {
  const t = setup(),
    { peers, room, code } = t.match(),
    p = peers[0],
    joined = p.last("joined"),
    oldWelcome = p.last("welcome");
  room.authority.battle.getEntity(joined.entityId).charge = 20;
  t.rooms.disconnect(p.id);
  assert.equal(room.authority.battle.getEntity(joined.entityId).charge, 0);
  assert.equal(room.host, peers[1].last("joined").entityId);
  const bad = t.peer();
  t.send(bad, "resume", { code, token: "wrong" });
  assert.ok(bad.last("error"));
  const reconnect = t.peer();
  t.send(reconnect, "resume", { code, token: joined.token });
  assert.equal(reconnect.last("welcome").entityId, joined.entityId);
  assert.notEqual(reconnect.last("welcome").connection, oldWelcome.connection);
  t.rooms.disconnect(reconnect.id);
  t.setNow(31000);
  t.tick();
  assert.equal(room.authority.battle.getEntity(joined.entityId).alive, false);
  assert.equal(room.phase, "finished");
  const late = t.peer();
  t.send(late, "resume", { code, token: joined.token });
  assert.ok(late.last("error"));
});
test("rematch uses a new epoch and requires everyone to prepare again", () => {
  const t = setup(),
    { peers, room } = t.match();
  room.authority.battle.entities[0].kills = 15;
  t.tick();
  assert.equal(room.phase, "finished");
  t.send(peers[0], "rematch");
  assert.equal(room.phase, "lobby");
  assert.ok(room.seats.every((s) => !s.ready));
  for (const p of peers) t.send(p, "ready", { ready: true });
  t.send(peers[0], "start");
  assert.equal(room.epoch, 2);
});
test("room isolation, leave cleanup, packet abuse and slow transports", () => {
  const t = setup(),
    a = t.match(),
    b = t.match();
  const count = b.peers[0].messages.length;
  t.send(a.peers[0], "leave");
  assert.equal(b.peers[0].messages.length, count);
  assert.equal(a.room.seats.length, 1);
  const p = t.peer();
  p.transport.bufferedAmount = 300000;
  t.send(p, "create");
  assert.ok(p.closed.length);
  assert.equal(t.rooms.clients.has(p.id), false);
  const q = t.peer();
  for (let i = 0; i < 122; i++) t.send(q, "ping");
  assert.equal(t.rooms.clients.has(q.id), false);
});
test("checkpoint restores active matches with new epoch and neutral controls", () => {
  const t = setup(),
    { peers, room, code } = t.match();
  t.tick(10);
  const original = room.authority.battle.snapshot(),
    data = t.rooms.checkpoint();
  const restored = new RoomServer({ now: () => 50000 });
  restored.restore(data);
  const r = restored.rooms.get(code);
  assert.equal(r.epoch, original.epoch + 1);
  assert.equal(r.authority.battle.tick, original.tick);
  assert.equal(r.seats[0].token, peers[0].last("joined").token);
  assert.ok(r.seats.every((s) => !s.clientId && s.disconnectedAt === 50000));
  assert.ok(
    r.authority.battle.entities.every((e) => e.speed === 0 && e.charge === 0),
  );
  assert.throws(() => restored.restore({ ...data, pluginManifest: "bad" }));
});
test("real browser transport class connects to room logic, drives, pauses only itself and resumes", () => {
  const t = setup();
  let now = 0;
  const sockets = [];
  class Socket {
    constructor() {
      this.listeners = {};
      this.readyState = 1;
      this.bufferedAmount = 0;
      sockets.push(this);
      this.id = t.rooms.connect({
        bufferedAmount: 0,
        send: (data) => this.emit("message", { data }),
        close: () => this.close(),
      });
    }
    addEventListener(k, fn) {
      (this.listeners[k] ??= []).push(fn);
    }
    emit(k, v = {}) {
      for (const fn of this.listeners[k] || []) fn(v);
    }
    send(data) {
      t.rooms.receive(this.id, data);
    }
    close() {
      this.readyState = 3;
      t.rooms.disconnect(this.id);
      this.emit("close");
    }
  }
  function client(type, code) {
    const errors = [],
      n = new NetworkSession({
        url: "ws://test/ws",
        WebSocketImpl: Socket,
        now: () => now,
        storage: null,
        onError: (e) => errors.push(e),
        schedule: () => 0,
        cancel: () => {},
      });
    n.connect({
      type,
      code,
      name: "Tester",
      loadout: { tankType: "medium", weaponType: "standard" },
    });
    sockets.at(-1).emit("open");
    return { n, errors };
  }
  const a = client("create"),
    b = client("join", a.n.room.code);
  a.n.send({ type: "ready", ready: true });
  b.n.send({ type: "ready", ready: true });
  a.n.send({ type: "start" });
  const start = a.n.current().entities[0].z;
  for (let i = 0; i < 60; i++) {
    now += 1000 / 60;
    a.n.advance(1 / 60, { forward: true });
    b.n.advance(1 / 60, {});
    t.tick();
  }
  assert.notEqual(a.n.current().entities[0].z, start);
  a.n.pause();
  t.tick(3);
  assert.equal(a.n.current().status, "playing");
  const saved = a.n.current();
  a.n.message(
    JSON.stringify({
      ...a.n.room,
      type: "welcome",
      version: C.VERSION,
      pluginManifest: C.PLUGIN_MANIFEST,
      matchId: a.n.replica.matchId,
      epoch: a.n.replica.epoch,
      entityId: a.n.playerId,
      connection: 9,
      tickRate: 60,
    }),
  );
  assert.deepEqual(a.n.current(), saved);
  assert.deepEqual(a.errors, []);
  assert.deepEqual(b.errors, []);
  a.n.close();
  b.n.close();
});

test("skill tap and simultaneous fire edges survive coalescing; cancel clears queued actions", () => {
  for (const cancel of [false, true]) {
    const t = setup(),
      { peers, room } = t.match(),
      p = peers[0],
      w = p.last("welcome");
    const inputs = [
      { ability: true, fire: true },
      { ability: true, fire: true, aimYaw: 0 },
      { ability: false, fire: false },
    ];
    if (cancel) inputs.push({ cancelFire: true });
    inputs.forEach((input, seq) =>
      t.rooms.receive(
        p.id,
        JSON.stringify({
          version: C.VERSION,
          type: "input",
          matchId: w.matchId,
          epoch: w.epoch,
          connection: w.connection,
          seq,
          clientTick: 0,
          input,
        }),
      ),
    );
    t.tick(3);
    assert.equal(
      room.authority.history.filter((e) => e.type === "ability").length,
      cancel ? 0 : 1,
    );
    assert.equal(
      room.authority.history.filter((e) => e.type === "shot").length,
      cancel ? 0 : 1,
    );
    assert.equal(
      room.authority.battle.getEntity(w.entityId).abilityHeld,
      false,
    );
  }
});

function stalledClient() {
  let now = 0;
  const sent = [],
    statuses = [],
    scheduled = [],
    sockets = [];
  class Socket {
    constructor() {
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.listeners = {};
      sockets.push(this);
    }
    addEventListener(k, fn) {
      (this.listeners[k] ??= []).push(fn);
    }
    emit(k, e = {}) {
      for (const fn of this.listeners[k] || []) fn(e);
    }
    send(data) {
      sent.push(JSON.parse(data));
    }
    close() {
      this.readyState = 3;
      this.emit("close");
    }
  }
  const n = new NetworkSession({
    url: "ws://test/ws",
    WebSocketImpl: Socket,
    now: () => now,
    storage: null,
    onStatus: (s) => statuses.push(s),
    schedule: (fn) => (scheduled.push(fn), scheduled.length),
    cancel() {},
  });
  n.connect({ type: "create" });
  sockets[0].emit("open");
  const authority = new S.Authority({
    participants: C.defaultParticipants().map((p) => ({
      ...p,
      controller: "human",
    })),
  });
  authority.battle.start();
  n.message(
    JSON.stringify({
      type: "joined",
      code: "ABCDEF",
      entityId: "p1",
      token: "test-token",
    }),
  );
  n.message(JSON.stringify(authority.attach("peer", "p1")));
  const deliver = () => n.message(JSON.stringify(authority.statePacket()));
  deliver();
  return {
    n,
    sent,
    statuses,
    scheduled,
    sockets,
    authority,
    deliver,
    time: (v) => {
      now = v;
    },
  };
}
test("a rejected state keeps the previous frame, records the reason and accepts the next valid state", () => {
  const t = stalledClient(), previous = t.n.current(), receivedAt = t.n.receivedAt;
  t.time(100);
  const bad = t.authority.statePacket();
  bad.snapshot.entities[0].hp = 999999;
  t.n.message(JSON.stringify(bad));
  assert.equal(t.n.current(), previous);
  assert.equal(t.n.receivedAt, receivedAt);
  assert.equal(t.n.stopped, false);
  assert.equal(t.sockets[0].readyState, 1);
  assert.match(t.n.packetError, /Invalid entity state/);
  assert.match(t.statuses.at(-1), /Invalid entity state/);
  t.authority.step();
  t.time(200);
  t.deliver();
  assert.equal(t.n.current().tick, 1);
  assert.equal(t.n.receivedAt, 200);
  assert.equal(t.n.packetError, null);
  assert.match(t.statuses.at(-1), /已恢复/);
  t.n.close();
});
test("repeated rejected states pause controls and reconnect instead of freezing forever", () => {
  const t = stalledClient();
  for (const now of [100, 200, 300]) {
    t.time(now);
    const bad = t.authority.statePacket();
    bad.snapshot.entities[0].hp = 999999;
    t.n.message(JSON.stringify(bad));
  }
  assert.equal(t.statuses.filter(s=>s.includes("校验失败")).length,1);
  t.time(1600);
  t.n.advance(0,{fire:true});
  assert.equal(t.n.stale,true);
  assert.equal(t.n.suspended,true);
  assert.match(t.n.packetError,/Invalid entity state/);
  t.time(5000);
  t.n.advance(0,{});
  assert.equal(t.sockets[0].readyState,3);
  assert.equal(t.scheduled.length,1);
  assert.match(t.n.packetError,/Invalid entity state/);
  t.n.close();
});
test("a rejected first state after welcome retries instead of waiting forever", () => {
  const t = stalledClient();
  t.authority.detach("peer");
  t.n.message(JSON.stringify(t.authority.attach("peer2","p1")));
  const bad = t.authority.statePacket();
  bad.snapshot.entities[0].hp = 999999;
  t.n.message(JSON.stringify(bad));
  assert.equal(t.n.replica.current,null);
  assert.match(t.n.packetError,/Invalid entity state/);
  assert.equal(t.sockets[0].readyState,3);
  assert.equal(t.scheduled.length,1);
  assert.equal(t.n.stopped,false);
  t.scheduled[0]();t.sockets[1].emit("open");
  assert.equal(t.n.retry,1,"failed reconnects must keep their backoff");
  t.authority.detach("peer2");
  t.n.message(JSON.stringify(t.authority.attach("peer3","p1")));
  t.deliver();
  assert.equal(t.n.packetError,null);
  assert.equal(t.n.retry,0,"a valid state resets reconnect backoff");
  t.n.close();
});
test("jittered snapshots never rewind the render clock or teleport on packet arrival", () => {
  const t = stalledClient();
  let lastX = 0;
  const beforeTruth = C.clone(t.n.current());
  const packets = [];
  for (let tick = 3; tick <= 120; tick += 3) {
    for (let i = 0; i < 3; i++) t.authority.step();
    t.authority.battle.entities[0].x = tick * 0.1;
    packets.push({ at: tick / 60 * 1000 + (tick % 6 ? 0 : 25), packet: t.authority.statePacket() });
  }
  let delivered = 0, maxStep = 0;
  for (let now = 0; now <= 2200; now += 5) {
    t.time(now);
    const before = t.n.state().entities[0].x;
    while (packets[delivered]?.at <= now) {
      t.n.message(packets[delivered++].packet);
      const after = t.n.state().entities[0].x;
      assert.ok(Math.abs(after - before) < 1e-8, "arrival must not reset interpolation");
    }
    const x = t.n.state().entities[0].x;
    assert.ok(x >= lastX - 1e-8, "forward motion must not snap backward");
    maxStep = Math.max(maxStep, x - lastX);
    lastX = x;
    assert.ok(x <= t.n.current().entities[0].x + 1e-8, "no overshoot past authority");
  }
  assert.ok(maxStep < 0.04, "bounded visual speed under jitter");
  assert.equal(t.n.current().entities[0].x, 12);
  assert.equal(beforeTruth.entities[0].x, 0);
  assert.ok(t.n.snapshots.length <= 32);
  t.n.close();
});
test("batched packets retain interpolation history and a stopped stream freezes without extrapolation", () => {
  const t = stalledClient();
  for (let batch = 1; batch <= 10; batch++) {
    for (let frame = 0; frame < 20; frame++) {
      t.time((batch - 1) * 100 + frame * 5);
      t.n.state();
    }
    t.time(batch * 100);
    const before = t.n.state().entities[0].x;
    for (let packet = 0; packet < 2; packet++) {
      for (let tick = 0; tick < 3; tick++) t.authority.step();
      t.authority.battle.entities[0].x = t.authority.battle.tick * 0.1;
      t.deliver();
    }
    assert.ok(Math.abs(t.n.state().entities[0].x - before) < 1e-8);
  }
  for (let now = 1100; now <= 2500; now += 50) { t.time(now); t.n.state(); }
  assert.equal(t.n.state().entities[0].x, t.n.current().entities[0].x);
  t.n.message(t.authority.attach("peer", "p1"));
  assert.equal(t.n.snapshots.length, 0);
  assert.equal(t.n.renderTick, null);
  t.deliver();
  assert.ok(Number.isFinite(t.n.state().entities[0].x));
  t.n.close();
});
test("stale snapshots pause held inputs once, block resume and recover only on newer state", () => {
  const t = stalledClient();
  t.n.advance(0, { fire: true, ability: true, forward: true });
  t.time(1500);
  t.n.advance(0, { fire: true, ability: true });
  assert.equal(t.n.suspended, true);
  assert.equal(t.n.stale, true);
  assert.deepEqual(t.sent.at(-1).input, { cancelFire: true });
  assert.equal(t.n.start(), false);
  const count = t.sent.length;
  t.time(1600);
  t.n.advance(0, { fire: true });
  assert.equal(t.sent.length, count);
  assert.equal(t.statuses.filter((s) => s.includes("同步超时")).length, 1);
  t.deliver();
  assert.equal(
    t.n.stale,
    true,
    "same tick packets cannot disguise a stalled simulation",
  );
  t.authority.step();
  t.deliver();
  assert.equal(t.n.stale, false);
  assert.equal(t.n.suspended, true, "recovery requires explicit resume");
  assert.match(t.statuses.at(-1), /已恢复/);
  t.n.advance(0, { fire: true, ability: true });
  assert.deepEqual(t.sent.at(-1).input, { cancelFire: true });
  assert.equal(t.n.start(), true);
  t.n.close();
});
test("five second stall reconnects once with token and a new welcome restores usable state", () => {
  const t = stalledClient();
  t.time(5000);
  t.n.advance(0, {});
  assert.equal(t.sockets[0].readyState, 3);
  assert.equal(t.scheduled.length, 1);
  t.n.advance(0, {});
  assert.equal(t.scheduled.length, 1);
  t.scheduled[0]();
  t.sockets[1].emit("open");
  assert.equal(t.sent.at(-1).type, "resume");
  assert.equal(t.sent.at(-1).token, "test-token");
  t.n.message(
    JSON.stringify({
      type: "joined",
      code: "ABCDEF",
      entityId: "p1",
      token: "test-token",
    }),
  );
  t.n.message(JSON.stringify(t.authority.attach("peer", "p1")));
  t.deliver();
  assert.equal(t.n.stale, false);
  assert.equal(t.n.start(), true);
  t.n.close();
});
test("normal snapshots keep manual pause; lobby and finished matches never trigger timeout", () => {
  const t = stalledClient();
  t.n.pause();
  for (let i = 1; i <= 8; i++) {
    t.time(i * 1000);
    t.authority.step();
    t.deliver();
    t.n.advance(0, {});
    assert.equal(t.n.stale, false);
    assert.equal(t.n.suspended, true);
  }
  t.n.room = { phase: "lobby" };
  t.time(20000);
  t.n.advance(0, {});
  assert.equal(t.sockets[0].readyState, 1);
  t.n.room = { phase: "finished" };
  t.authority.battle.status = "finished";
  t.deliver();
  t.time(40000);
  t.n.advance(0, {});
  assert.equal(t.sockets[0].readyState, 1);
  t.n.close();
});

test("browser timers retain the Window receiver during connect, reconnect and close", () => {
  const vm = require("node:vm"),
    fs = require("node:fs"),
    path = require("node:path");
  const context = vm.createContext({ TankBattle: C, TankSession: S, performance: { now: () => 0 } });
  vm.runInContext(
    `
    window = globalThis;
    pending = []; cleared = [];
    setTimeout = function (callback, delay) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      pending.push({ callback, delay }); return pending.length;
    };
    clearTimeout = function (id) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      cleared.push(id);
    };
  `,
    context,
  );
  vm.runInContext(
    fs.readFileSync(path.join(__dirname, "../network-session.js"), "utf8"),
    context,
  );
  const sockets = [];
  class Socket {
    constructor() {
      this.readyState = 1;
      this.bufferedAmount = 0;
      this.events = {};
      this.sent = [];
      sockets.push(this);
    }
    addEventListener(name, handler) {
      this.events[name] = handler;
    }
    send(raw) {
      this.sent.push(JSON.parse(raw));
    }
    close() {
      this.events.close();
    }
  }
  const client = new context.TankNetwork.NetworkSession({
    url: "ws://test",
    WebSocketImpl: Socket,
    storage: null,
  });
  client.connect({
    type: "create",
    name: "Host",
    loadout: { tankType: "medium", weaponType: "standard" },
  });
  sockets[0].events.open();
  assert.equal(sockets[0].sent[0].type, "create");
  client.credentials = { code: "ABCDEF", token: "test-token" };
  sockets[0].events.close();
  assert.equal(context.pending.length, 1);
  assert.equal(context.pending[0].delay, 500);
  context.pending[0].callback();
  sockets[1].events.open();
  assert.equal(sockets[1].sent[0].type, "resume");
  client.close();
  assert.equal(context.pending.length, 1);
  assert.ok(context.cleared.includes(1));
});

test("network quality measures round-trip only from its outstanding ping", () => {
  const t = stalledClient();
  for (let i = 0; i < 3; i++) t.authority.step();
  t.time(2000); t.deliver(); t.n.advance(0, {});
  assert.equal(t.sent.at(-1).type, "ping");
  t.time(2120); t.n.message({ type: "pong", sentAt: 2000 });
  assert.equal(t.n.rtt, 120);
  t.n.message({ type: "pong", sentAt: 1999 });
  assert.equal(t.n.rtt, 120);
  t.n.close();
});
