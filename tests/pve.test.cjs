const { test } = require('node:test');
const assert = require('node:assert/strict');
const C = require('../battle-core.js');
const S = require('../battle-session.js');
const { RoomServer } = require('../room-server.js');
const participants = (count = 1) => Array.from({length: count}, (_, i) => ({id: 'p' + i, controller: 'human', tankType: 'heavy', weaponType: 'rocket', spawn: i}));
const create = (count = 1, map = null) => { const b = new C.Battle({mode:'pve', participants:participants(count),...(map?{map}:{})}); b.start(); return b; };
function enemies(b){return b.entities.filter(e=>e.tankType==='zombie');}
function markMidBossDefeated(b){
  const boss=enemies(b).at(-1);
  Object.assign(boss,{zombieType:'boss',alive:false,hp:0,maxHp:C.PVE.healthFor('boss',b.pve.teamSize,b.pve.wave),speed:0});
  Object.assign(b.pve.boss,{stage:1,spawned:false,defeated:false,telegraph:null});
}
function clearWave(b) {
  b.pve.wave = Math.max(1, b.pve.wave);
  b.pve.nextWaveAt = 0; b.pve.queue = 0;
  for (const z of enemies(b)) { z.protectedUntil = 0; if (z.alive) b.damage(z, 1000, b.entities[0].id, z); }
  b.step();
  if (!b.pve.choices[b.entities[0].id]) C.PVE.progression.addExperience(b, C.PVE.progression.xpNeeded(b.pve.level), C.PVE.rewards);
}
test('PvE has 32 ordinary slots plus a dedicated boss and only ordinary enemy health is halved',()=>{
  const b=create(),roster=enemies(b);
  assert.equal(roster.length,33);
  assert.equal(roster.at(-1).id,'zombie_32');
  assert.equal(C.PVE.MAX_ZOMBIES,33);
  for(const type of ['walker','cone','runner','bucket','brute']){
    const wave=C.ZOMBIE_SPECS[type].wave;
    assert.equal(C.PVE.healthFor(type,1,wave),
      Math.round(C.ZOMBIE_SPECS[type].hp*.5*(1+C.RULES.pveHealthPerWave*(wave-1))),type);
  }
  for(const type of ['boss','titan']){
    const wave=C.ZOMBIE_SPECS[type].wave;
    assert.equal(C.PVE.healthFor(type,1,wave),
      Math.round(C.ZOMBIE_SPECS[type].hp*(1+C.RULES.pveHealthPerWave*(wave-1))),type);
  }
  assert.equal(C.VERSION,38);
  S.validateSnapshot(b.snapshot());
});
test("PvE and PvP both use the ground-only garden with distinct starts",()=>{
  const pve=create(),pvp=new C.Battle();
  assert.equal(pve.map.levels.length,1);assert.equal(pve.map.ramps.length,0);
  assert.equal(pve.map.dropExits.length,0);assert.equal(pve.map.spawns.length,8);
  assert.ok([...pve.map.obstacles,...pve.map.pickups,...pve.map.spawns].every(x=>x.floor===0));
  assert.ok(pve.entities.every(e=>e.floor===0));
  assert.equal(pvp.map.levels.length,1);assert.equal(pvp.map.ramps.length,0);
  assert.deepEqual(pvp.map.terrain,pve.map.terrain);assert.notDeepEqual(pvp.map.spawns,pve.map.spawns);
  S.validateSnapshot(pve.snapshot());
  const upper=pve.snapshot();Object.assign(upper.entities[0],{floor:1,y:8});
  assert.throws(()=>S.validateSnapshot(upper),/Invalid entity state/);
  const ramp=pve.snapshot();Object.assign(ramp.entities[0],{rampId:'west-01',rampDir:1});
  assert.throws(()=>S.validateSnapshot(ramp),/Invalid ramp state/);
});
test('PvE authority does not defeat a living team at or after the old sixteen-minute deadline',()=>{
  const b=create(),p=b.entities[0],oldDeadline=16*60*C.TICK_RATE;
  b.tick=oldDeadline-1;b.step();
  assert.equal(b.status,'playing');assert.equal(b.pve.result,null);assert.equal(p.hp,80);
  b.tick=oldDeadline*2;b.step();
  assert.equal(b.status,'playing');assert.equal(b.pve.result,null);
  S.validateSnapshot(b.snapshot());
});
test('PvP keeps eight minutes while the sixteen-wave PvE campaign has no simulation deadline', () => {
  assert.equal(C.RULES.duration, 8 * 60 * C.TICK_RATE);
  assert.throws(() => new C.Battle({participants:participants()}));
  const b=create(), p=b.entities[0];
  assert.equal(p.tankType, 'human'); assert.equal(p.weaponType,'pistol'); assert.equal(p.hp,80);
  assert.equal(enemies(b).length,33); assert.ok(enemies(b).every(e=>!e.alive));
  p.kills=15; b.step(); assert.equal(b.status,'playing');
  assert.throws(()=>new C.Battle({participants:[{...participants()[0],tankType:'zombie'},...participants(2).slice(1)]}));
  b.tick=C.RULES.duration-1;b.step();assert.equal(b.status,'playing');S.validateSnapshot(b.snapshot());
  b.tick = 16*60*C.TICK_RATE-1; b.step(); assert.equal(b.pve.result,null);
  assert.equal(b.status,'playing'); S.validateSnapshot(b.snapshot());
});
test('v36 weapon branches reject pre-branch checkpoints',()=>{
  assert.equal(C.VERSION,38);
  const old=create().snapshot();old.version=35;
  assert.throws(()=>S.validateSnapshot(old),/Invalid snapshot header/);
});
test('v32 pursuit rule still rejects v31 checkpoints',()=>{
  const old=create().snapshot();old.version=31;
  assert.throws(()=>S.validateSnapshot(old),/Invalid snapshot header/);
});
test('untimed PvE rule persists and rejects old v30 checkpoints',()=>{
  assert.equal(Object.hasOwn(C.RULES,'pveDuration'),false);
  const old=create().snapshot();old.version=30;
  assert.throws(()=>S.validateSnapshot(old),/Invalid snapshot header/);
});
test('both bosses have runner-speed base pursuit',()=>{
  const runner=C.ZOMBIE_SPECS.runner.speed;
  for(const type of ['boss','titan'])assert.equal(C.ZOMBIE_SPECS[type].speed,runner,type);
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
  Object.assign(p,{x:0,z:55}); Object.assign(z,{x:8,z:55,y:0,floor:0,alive:true,hp:z.maxHp,heading:0});
  b.pve.nextWaveAt = 100000; b.pve.wave=1;
  for(let i=0;i<200;i++) b.step();
  assert.ok(z.x<3, String(z.x)); assert.ok(p.hp<80); assert.equal(b.bullets.length,0); assert.equal(z.abilityUntil,0);
  const hp=p.hp; for(let i=0;i<59;i++) b.step(); assert.ok(hp-p.hp<=10);
  S.validateSnapshot(b.networkSnapshot(),{network:true});
});
test('PvE zombies steer toward players without braking in place',()=>{
  for(const type of ['walker','cone','runner','bucket','brute','boss','titan']){
    const b=create(),p=b.entities[0],z=enemies(b)[0],spec=C.ZOMBIE_SPECS[type];
    Object.assign(p,{x:0,z:55});
    Object.assign(z,{x:8,z:55,y:0,floor:0,alive:true,hp:spec.hp,maxHp:spec.hp,
      zombieType:type,heading:Math.PI/2,brain:{target:null,path:[],pathTick:0,blocked:0}});
    const input=b.botInput(z);
    assert.equal(input.forward,true,type+' forward');
    assert.equal(input.brake,false,type+' brake');
  }
  const duel=new C.Battle({participants:[
    {id:'human',controller:'human',tankType:'medium',weaponType:'standard',spawn:0},
    {id:'bot',controller:'bot',tankType:'medium',weaponType:'standard',spawn:1},
  ]});duel.start();
  const [human,bot]=duel.entities;
  Object.assign(human,{x:0,z:55});Object.assign(bot,{x:40,z:55,heading:Math.PI/2,
    brain:{target:human.id,path:[{x:0,z:55}],pathTick:10000,blocked:0}});
  const versus=duel.botInput(bot);
  assert.equal(versus.forward,false,'PvP bot keeps its original turning rule');
  assert.equal(versus.brake,true);
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
test('high-numbered zombies and both bosses do not wait outside melee range', () => {
  for(const type of ['walker','boss','titan']) {
    const elite=['boss','titan'].includes(type),b=create(),p=b.entities[0],z=enemies(b)[elite?15:6],spec=C.ZOMBIE_SPECS[type];
    Object.assign(p,{x:0,z:55,hp:10000,maxHp:10000,protectedUntil:0});
    Object.assign(z,{x:elite?-8:8,z:55,y:0,floor:0,alive:true,protectedUntil:0,
      zombieType:type,hp:spec.hp,maxHp:spec.hp,
      heading:elite?Math.PI:0,brain:{target:null,path:[],pathTick:0,blocked:0}});
    b.pve.nextWaveAt=100000;b.pve.queue=0;b.pve.wave=type==='titan'?16:type==='boss'?8:6;
    if(elite)Object.assign(b.pve.boss,{stage:type==='titan'?2:1,spawned:true,nextAttackAt:100000});
    let hits=0;for(let i=0;i<600;i++)for(const event of b.step())
      if(event.type==='damage'&&event.id===p.id&&event.owner===z.id)hits++;
    assert.ok(hits>0,type);
  }
});
test('simultaneously blocked zombies invalidate stale paths but spread A-star work across ticks', () => {
  const b=create(),p=b.entities[0],pack=enemies(b),route=b.route.bind(b);
  Object.assign(p,{x:0,z:55});b.tick=0;
  for(const [i,z] of pack.entries())Object.assign(z,{x:20+i,z:55,y:0,floor:0,alive:true,
    brain:{target:p.id,path:[{x:100,z:100}],pathTick:10000,blocked:12}});
  let calls=0;b.route=(...args)=>{calls++;return route(...args);};
  for(const z of pack)b.botInput(z);
  assert.equal(calls,1);
  assert.ok(pack.slice(1).every(z=>z.brain.path.length===0&&z.brain.pathTick===0));
});
test('all thirty-three zombie slots including the boss can replan without synchronized A-star bursts',()=>{
  const b=create(),p=b.entities[0],pack=enemies(b),route=b.route.bind(b),seen=new Set();
  Object.assign(p,{x:0,z:55});
  for(const [i,z] of pack.entries())Object.assign(z,{x:20+i,z:55,y:0,floor:0,alive:true,
    brain:{target:p.id,path:[{x:100,z:100}],pathTick:10000,blocked:12}});
  for(let tick=0;tick<pack.length;tick++){
    b.tick=tick;const routed=[];
    b.route=(z,...args)=>{routed.push(z.id);return route(z,...args);};
    for(const z of pack)b.botInput(z);
    assert.ok(routed.length<=1,'A-star budget at tick '+tick);
    for(const id of routed)seen.add(id);
  }
  assert.equal(seen.size,pack.length,'boss slot must get a route too');
  assert.ok(seen.has('zombie_32'));
});
test('fast bosses go around solid cover and reach the player instead of orbiting a waypoint',()=>{
  for(const type of ['boss','titan']){
    const b=create(),p=b.entities[0],z=enemies(b).at(-1),wave=type==='boss'?8:16,
      hp=C.PVE.healthFor(type,1,wave);
    b.map.obstacles=C.clone(C.MAP.obstacles.filter(o=>o.floor===0));delete b.map.terrain;
    Object.assign(p,{x:-28,z:11,hp:10000,maxHp:10000,protectedUntil:0});
    Object.assign(z,{x:-7,z:11,y:0,floor:0,alive:true,hp,maxHp:hp,
      zombieType:type,heading:Math.PI,protectedUntil:0,
      brain:{target:null,path:[],pathTick:0,blocked:0}});
    Object.assign(b.pve,{wave,queue:0,nextWaveAt:100000});
    Object.assign(b.pve.boss,{stage:type==='boss'?1:2,spawned:true,
      defeated:false,nextAttackAt:100000});
    assert.equal(b.sight(z,p),false,'rock initially blocks '+type);
    let bossHits=0;
    for(let i=0;i<900&&bossHits===0&&b.status==='playing';i++){
      for(const event of b.step())
        if(event.type==='damage'&&event.id===p.id&&event.owner===z.id)bossHits++;
      assert.ok(b.valid(z.x,z.z,z.floor,z),type+' stays outside rock');
    }
    assert.ok(bossHits>0,type+' should reach the player around rock');
  }
});
test('wave rewards are validated once, persist and affect authority cooldown, healing and area damage', () => {
  const b=create(), p=b.entities[0]; p.hp=37; clearWave(b);
  assert.equal(p.hp,57,'clearing a wave still restores 20 health');
  assert.equal(b.pve.choices[p.id].length,3);
  assert.equal(b.chooseUpgrade(p.id,0,'haste'),false);
  assert.equal(b.chooseUpgrade('other',1,'haste'),false);
  b.pve.choices[p.id]=['haste','regen','modEmber'];
  assert.equal(b.chooseUpgrade(p.id,1,'haste'),true);
  assert.equal(b.chooseUpgrade(p.id,1,'haste'),false);
  b.shoot(p); assert.equal(p.cooldown,22);
  b.pve.upgrades[p.id].regen=2; p.hp=50; b.tick=59; b.step(); assert.equal(p.hp,52);
  const z=enemies(b)[0]; Object.assign(p,{x:0,z:55}); Object.assign(z,{x:4,z:55,y:0,floor:0,hp:z.maxHp,alive:true,protectedUntil:0});
  b.bullets=[];b.pve.upgrades[p.id].modEmber=1;b.tick=239;
  b.pveHit({id:z.id,point:{x:z.x,y:1.5,z:z.z}},{owner:p.id,weaponType:'pistol'});
  b.tick=298;b.step();assert.equal(z.hp,z.maxHp-14);
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
test('eight players and thirty-two zombies stay within packet bounds and pass replica validation', () => {
  const a=new S.Authority({mode:'pve', participants:participants(8)}), b=a.battle;
  const replica=new S.Replica();replica.welcome(a.attach('peer','p0'));b.start();
  for(const player of b.entities.filter(e=>e.tankType==='human'))player.protectedUntil=10000;
  b.pve.nextWaveAt=1; b.pve.wave=10;markMidBossDefeated(b);
  for(let i=0;i<660;i++){
    a.step();
    if(i%3===0){const packet=a.statePacket({network:true});packet.events=packet.events.slice(-64);
      assert.ok(Buffer.byteLength(JSON.stringify(packet))<65536);
      assert.equal(replica.receive(packet).ok,true, 'tick '+b.tick);
    }
  }
  assert.ok(enemies(b).filter(e=>e.alive).length>16);
  // Accelerate only this stress probe's spawn clock; keep the real spawn method and valid snapshots.
  for(let i=0;i<64&&enemies(b).filter(e=>e.alive).length<32;i++){
    b.pve.nextSpawnAt=b.tick;
    a.step();
    S.validateSnapshot(b.snapshot());
  }
  assert.equal(enemies(b).filter(e=>e.alive).length,32);
  const crowdedPacket=a.statePacket({network:true});crowdedPacket.events=crowdedPacket.events.slice(-64);
  assert.ok(Buffer.byteLength(JSON.stringify(crowdedPacket))<65536);
  const crowdedResult=replica.receive(crowdedPacket);
  assert.equal(crowdedResult.ok,true,crowdedResult.reason);
  b.pve.upgrades.p0.modEmber=1;b.pve.upgrades.p0.modFracture=1;
  for(const z of enemies(b).filter(e=>e.alive))b.pve.moduleStatus[z.id]={
    burnUntil:b.tick+240,burnNext:b.tick+60,burnOwner:'p0',fractureUntil:b.tick+240,fractureOwner:'p0'};
  const modulePacket=a.statePacket({network:true});
  assert.ok(Buffer.byteLength(JSON.stringify(modulePacket))<65536);
  const moduleResult=replica.receive(modulePacket);
  assert.equal(moduleResult.ok,true,moduleResult.reason);
  S.validateSnapshot(b.snapshot());
  for(const mutate of [s=>s.pve.upgrades.p0.haste=999,s=>s.pve.queue=1000,s=>s.entities.pop(),s=>s.pve.choices.p0=['injected']]){
    const bad=b.snapshot();mutate(bad);assert.throws(()=>S.validateSnapshot(bad));
  }
});
for (const previousWave of [4, 10]) test(`wave ${previousWave + 1} automatically adds enemies and XP without leaking later`,()=>{
  const b=create(),p=b.entities[0];b.pve.wave=previousWave;b.pve.queue=0;b.pve.nextWaveAt=0;
  if (previousWave > 8) {
    b.pve.boss.stage = 1;
    enemies(b).at(-1).zombieType = 'boss';
  }
  for(const z of enemies(b))z.maxHp=C.PVE.healthFor(z.zombieType,1,previousWave);
  b.step();
  b.tick=b.pve.nextWaveAt-1;b.step();
  assert.equal(b.pve.wave,previousWave+1);assert.equal(b.pve.riskyWave,previousWave+1);
  assert.equal(b.pve.queue+enemies(b).filter(z=>z.alive).length,4+(previousWave+1)*2+4);
  const first=enemies(b).find(z=>z.alive);
  assert.equal(first.zombieType,'runner');
  first.protectedUntil=0;b.damage(first,10000,p.id,first);
  assert.equal(b.pve.xp,Math.ceil(12*1.25));
  b.pve.queue=0;for(const z of enemies(b)){z.alive=false;z.hp=0;}
  b.pve.nextWaveAt=b.tick+1;b.step();
  assert.equal(b.pve.wave,previousWave+2);assert.equal(b.pve.riskyWave,0);
  S.validateSnapshot(b.snapshot());
});
test('risk starts automatically after the ordinary 10-second break',()=>{
  const b=create(2);b.pve.wave=4;b.pve.queue=0;b.pve.nextWaveAt=0;
  for(const z of enemies(b))z.maxHp=C.PVE.healthFor(z.zombieType,2,4);
  b.step();assert.equal(b.pve.trial,undefined);
  const before=b.pve.nextWaveAt;
  assert.equal(before-b.tick,10*C.TICK_RATE,'the automatic break lasts 10 seconds');
  assert.equal(typeof b.startNextWave,'undefined');
  b.step();assert.equal(b.pve.wave,4);
  assert.equal(b.pve.nextWaveAt,before);
  b.tick=b.pve.nextWaveAt-1;b.step();
  assert.equal(b.pve.wave,5);assert.equal(b.pve.riskyWave,5);
  assert.equal(b.pve.queue+enemies(b).filter(z=>z.alive).length,4+5*2+3+4);
  S.validateSnapshot(b.snapshot());
});
test('automatic risk preserves upgrade cards through the timed break',()=>{
  const b=create(),p=b.entities[0];
  b.pve.wave=4;b.pve.queue=0;b.pve.nextWaveAt=0;
  for(const z of enemies(b))z.maxHp=C.PVE.healthFor(z.zombieType,1,4);
  C.PVE.progression.addExperience(b,C.PVE.progression.xpNeeded(b.pve.level),C.PVE.rewards);
  const cards=b.pve.choices[p.id].slice(),offerId=b.pve.choiceIds[p.id];
  b.step();
  assert.equal(b.pve.trial,undefined);
  const scheduled=b.pve.nextWaveAt;
  b.step();assert.equal(b.pve.wave,4);
  assert.equal(b.pve.nextWaveAt,scheduled);
  b.tick=scheduled-1;
  b.step();
  assert.equal(b.pve.wave,5);assert.equal(b.pve.riskyWave,5);
  assert.deepEqual(b.pve.choices[p.id],cards);
  assert.equal(b.pve.choiceIds[p.id],offerId);
  assert.equal(b.chooseUpgrade(p.id,4,cards[0],offerId),true,'old card remains claimable after the next wave');
  assert.equal(b.chooseUpgrade(p.id,5,cards[0],offerId),false,'replayed offer is rejected');
  S.validateSnapshot(b.snapshot());
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
test('zombies retain generic ramp navigation on an explicit custom multilevel map', () => {
  const b=create(1,C.MAP), p=b.entities[0], z=enemies(b)[0];
  Object.assign(p,{x:-36,z:-4,floor:1,y:8});
  Object.assign(z,{x:-36,z:32,floor:0,y:0,hp:80,alive:true,heading:-Math.PI/2,aim:-Math.PI/2});
  b.pve.nextWaveAt=10000; b.pve.wave=1;
  let onRamp=false;
  for(let i=0;i<1600 && z.floor!==1;i++) {
    b.step();onRamp ||= !!z.rampId;
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
    assert.equal(z.maxHp,Math.round(40*(1+0.7*(n-1))));
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
  assert.equal(b.pve.teamSize,4);assert.equal(z.maxHp,124);assert.equal(z.hp,70);
  b.entities[1].forfeited=true;b.step();
  assert.equal(b.pve.teamSize,3);assert.equal(z.maxHp,96);assert.equal(z.hp,55);
  const dead=enemies(b)[1];assert.equal(dead.hp,0);assert.equal(dead.alive,false);
  S.validateSnapshot(b.snapshot());
});
test('every PvE enemy gains seventy percent health per additional player', () => {
  const cases=[
    {players:1,mid:1620,final:3850},
    {players:2,mid:2754,final:6545},
    {players:4,mid:5022,final:11935},
    {players:8,mid:9558,final:22715},
  ];
  for(const {players,mid,final} of cases){
    assert.equal(C.PVE.healthFor('boss',players,8),mid);
    assert.equal(C.PVE.healthFor('titan',players,16),final);
    for(const type of ['walker','cone','runner','bucket','brute']){
      const wave=C.ZOMBIE_SPECS[type].wave;
      assert.equal(C.PVE.healthFor(type,players,wave),
        Math.round(C.ZOMBIE_SPECS[type].hp*.5*(1+0.7*(players-1))*(1+0.05*(wave-1))),
        type+' at '+players+' players');
    }
  }
  const mid=create(4);mid.pve.wave=7;mid.pve.nextWaveAt=1;mid.step();
  const boss=enemies(mid).at(-1);
  assert.equal(boss.zombieType,'boss');assert.equal(boss.maxHp,5022);
  S.validateSnapshot(mid.snapshot());
  mid.entities[3].forfeited=true;mid.step();
  assert.equal(mid.pve.teamSize,3);assert.equal(boss.maxHp,C.PVE.healthFor('boss',3,8));
  S.validateSnapshot(mid.snapshot());
  const final=create(8);final.pve.wave=15;markMidBossDefeated(final);
  final.pve.nextWaveAt=1;final.step();
  assert.equal(enemies(final).at(-1).zombieType,'titan');
  assert.equal(enemies(final).at(-1).maxHp,22715);
  S.validateSnapshot(final.snapshot());
});
test('zombie health gains five percent per wave on top of team scaling', () => {
  assert.equal(C.PVE.healthFor('walker',1,1),40);
  assert.equal(C.PVE.healthFor('walker',1,8),54);
  assert.equal(C.PVE.healthFor('titan',8,16),22715);
  const b=create();
  b.pve.wave=7;b.pve.nextWaveAt=1;b.step();
  const boss=enemies(b).find(z=>z.alive&&z.zombieType==='boss');
  assert.equal(b.pve.wave,8);assert.equal(boss.hp,1620);assert.equal(boss.maxHp,1620);
  S.validateSnapshot(b.snapshot());
  const forged=b.snapshot();enemies(forged).find(z=>z.alive&&z.zombieType==='boss').maxHp=1200;
  assert.throws(()=>S.validateSnapshot(forged),/Invalid entity state/);
});
test('wave composition unlocks four early enemies and giants only after the mid boss', () => {
  const seen=new Set(),bossTypes=new Set(['boss','titan']);
  for (let wave=1;wave<=15;wave++) {
    for(let ordinal=0;ordinal<20;ordinal++) {
      const type=C.PVE.typeFor(wave,ordinal);seen.add(type);
      assert.ok(C.ZOMBIE_SPECS[type].wave<=wave);
      if(wave===1) assert.equal(type,'walker');
      if(wave>8)assert.notEqual(type,'walker');
    }
  }
  assert.deepEqual([...seen].sort(),Object.keys(C.ZOMBIE_SPECS).filter(k=>!bossTypes.has(k)).sort());
  for (const [type,spec] of Object.entries(C.ZOMBIE_SPECS).filter(([k])=>!bossTypes.has(k))) {
    const b=create(), p=b.entities[0], z=enemies(b)[0],wave=Math.max(1,spec.wave);
    b.pve.wave=wave;b.pve.nextWaveAt=10000;
    for(const e of enemies(b)){e.maxHp=C.PVE.healthFor(e.zombieType,b.pve.teamSize,wave);e.hp=e.alive?e.maxHp:0;}
    if(wave>=8)markMidBossDefeated(b);
    Object.assign(p,{x:0,z:55});
    const maxHp=C.PVE.healthFor(type,b.pve.teamSize,wave);
    Object.assign(z,{zombieType:type,maxHp,hp:maxHp,alive:true,x:8,z:55,y:0,floor:0,heading:0});
    for(let i=0;i<30;i++) b.step();
    assert.ok(Math.abs(z.speed-spec.speed)<0.001,type);
    Object.assign(z,{x:1.9,z:55,speed:0,cooldown:0});
    b.step();assert.equal(p.hp,80-(spec.meleeDamage+Math.min(16,wave*2)),type);
    assert.equal(z.cooldown,spec.meleeCooldown-1);
    S.validateSnapshot(b.snapshot());
  }
});
test('sixteen-wave campaign removes walkers after wave eight and uses different mid and final bosses',()=>{
  for(let wave=1;wave<=7;wave++)for(let i=0;i<40;i++)assert.notEqual(C.PVE.typeFor(wave,i),'brute');
  const late=Array.from({length:80},(_,i)=>C.PVE.typeFor(9+(i%7),i));
  assert.equal(late.includes('walker'),false);assert.equal(late.includes('brute'),true);
  assert.equal(C.ZOMBIE_SPECS.boss.wave,8);assert.equal(C.ZOMBIE_SPECS.titan.wave,16);
  const b=create(2),[p,q]=b.entities;b.damage(q,10000,null,q);
  b.tick=1;b.pve.wave=7;b.pve.nextWaveAt=1;b.step();
  const mid=enemies(b).find(z=>z.zombieType==='boss');
  assert.equal(b.pve.wave,8);assert.equal(b.pve.boss.stage,1);assert.ok(mid?.alive);assert.equal(q.alive,true);
  const midHp=mid.maxHp;mid.protectedUntil=0;b.damage(mid,100000,p.id,mid);b.step();
  assert.equal(b.status,'playing');assert.equal(b.pve.boss.spawned,false);assert.equal(b.pve.boss.defeated,false);
  S.validateSnapshot(b.snapshot());
  b.pve.wave=15;b.pve.nextWaveAt=b.tick;b.step();
  const final=enemies(b).find(z=>z.zombieType==='titan');
  assert.equal(b.pve.wave,16);assert.equal(b.pve.boss.stage,2);assert.ok(final?.alive);
  assert.notEqual(final.maxHp,midHp);
  b.pve.boss.nextAttackAt=1e9;
  const supportAt=Math.ceil((b.tick+1)/180)*180;
  b.tick=supportAt-1;b.step();b.tick=supportAt+179;b.step();
  const support=enemies(b).filter(z=>z.alive&&z.zombieType!=='titan');
  assert.deepEqual(new Set(support.map(z=>z.zombieType)),new Set(['brute','runner']));
  assert.equal(support.some(z=>z.zombieType==='walker'),false);
  b.pve.boss.nextAttackAt=b.tick;
  C.PVE.progression.bossAttack(b);
  assert.equal(b.pve.boss.telegraph.at,b.tick+96);assert.equal(b.pve.boss.telegraph.zones[0].radius,9);
  assert.equal(b.pve.boss.telegraph.zones.length,2);
  const first=b.pve.boss.telegraph,z=first.zones[0];Object.assign(p,{x:z.x,y:z.y,z:z.z,hp:80,protectedUntil:0});
  b.tick=first.at-1;C.PVE.progression.bossAttack(b);assert.equal(p.hp,80);
  b.tick=first.at;C.PVE.progression.bossAttack(b);assert.equal(p.hp,20);assert.equal(b.pve.boss.nextAttackAt,b.tick+150);
  final.hp=final.maxHp/2-1;b.tick=b.pve.boss.nextAttackAt;C.PVE.progression.bossAttack(b);
  assert.equal(b.pve.boss.telegraph.at,b.tick+96);assert.equal(b.pve.boss.telegraph.zones[0].radius,11);
  assert.equal(b.pve.boss.telegraph.zones.length,2);
  const rage=b.pve.boss.telegraph,rz=rage.zones[0];Object.assign(p,{x:rz.x,y:rz.y,z:rz.z,hp:80,protectedUntil:0});
  b.tick=rage.at-1;C.PVE.progression.bossAttack(b);assert.equal(p.hp,80);
  b.tick=rage.at;C.PVE.progression.bossAttack(b);assert.equal(p.hp,10);assert.equal(b.pve.boss.nextAttackAt,b.tick+90);
  S.validateSnapshot(b.snapshot());
  final.protectedUntil=0;b.damage(final,100000,p.id,final);b.step();assert.equal(b.pve.result,'victory');
  S.validateSnapshot(b.snapshot());
});
test('checkpoint validation rejects forged victory, skipped mid boss and a stale boss after wave eight',()=>{
  const direct=create(),directWin=direct.snapshot();
  directWin.status='finished';directWin.pve.result='victory';
  assert.throws(()=>S.validateSnapshot(directWin));

  const midBattle=create();midBattle.tick=1;midBattle.pve.wave=7;midBattle.pve.nextWaveAt=1;midBattle.step();
  const skipped=midBattle.snapshot(),slot=enemies(skipped).find(e=>e.zombieType==='boss');
  Object.assign(slot,{zombieType:'walker',alive:false,hp:0,maxHp:80,speed:0});
  Object.assign(skipped.pve.boss,{spawned:false,telegraph:null});
  assert.throws(()=>S.validateSnapshot(skipped));

  const stale=midBattle.snapshot();stale.pve.wave=10;
  assert.throws(()=>S.validateSnapshot(stale));

  const finalBattle=create(),owner=finalBattle.entities[0];
  finalBattle.tick=1;finalBattle.pve.wave=7;finalBattle.pve.nextWaveAt=1;finalBattle.step();
  const firstBoss=enemies(finalBattle).find(e=>e.zombieType==='boss');firstBoss.protectedUntil=0;
  finalBattle.damage(firstBoss,100000,owner.id,firstBoss);finalBattle.step();
  finalBattle.pve.wave=15;finalBattle.pve.nextWaveAt=finalBattle.tick;finalBattle.step();
  const premature=finalBattle.snapshot();premature.status='finished';premature.pve.result='victory';
  assert.throws(()=>S.validateSnapshot(premature));
});
test('scaled variants survive replica and checkpoint replay; forged health/type/team size are rejected', () => {
  const a=new S.Authority({mode:'pve',participants:participants(8)}), b=a.battle;
  const r=new S.Replica();r.welcome(a.attach('peer','p0'));b.start();
  b.pve.wave=8;markMidBossDefeated(b);b.pve.nextWaveAt=1;
  for(let i=0;i<500;i++) a.step();
  assert.ok(enemies(b).some(e=>e.zombieType==='brute'&&e.maxHp===C.PVE.healthFor('brute',8,9)));
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
