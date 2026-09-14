const { test } = require("node:test"),
  assert = require("node:assert/strict");
const C = require("../battle-core.js"),
  S = require("../battle-session.js");
function battle(types = ["human", "heavy"], weaponType = "rocket") {
  const map = C.clone(C.MAP);
  map.obstacles = [];
  map.pickups = [];
  const b = new C.Battle({
    map,
    participants: types.map((tankType, i) => ({
      id: "p" + i,
      controller: "human",
      tankType,
      weaponType: i ? "standard" : weaponType,
      spawn: i,
    })),
  });
  b.start();
  return b;
}
function put(e, x, z, floor = 0) {
  Object.assign(e, { x, z, floor, y: floor * 8, speed: 0 });
}
function impact(b, x = 0, y = 2, z = 0) {
  b.resolveHit(
    { kind: "cover", id: "test", point: { x, y, z } },
    { weaponType: "rocket", owner: "p0", damage: 20, dx: 0, dy: 0, dz: -1 },
  );
}
test("human has 80 health, no shield and a smaller hit box; a full laser is lethal", () => {
  const b = battle(["medium", "human"], "laser"),
    [a, h] = b.entities;
  put(a, 0, 20);
  put(h, 0, 0);
  assert.equal(h.hp, 80);
  assert.equal(h.shield, 0);
  assert.ok(C.TANKS.human.radius < C.TANKS.light.radius);
  assert.equal(
    b.collision({ x: 1.2, y: 2, z: 5 }, { x: 1.2, y: 2, z: -5 }, a.id),
    null,
  );
  b.shoot(a);
  assert.equal(h.alive, false);
  assert.equal(a.kills, 1);
});
test("human moves relative to camera without diagonal speed gain and can dodge into collision", () => {
  const b = battle(),
    a = b.entities[0];
  put(a, 0, 40);
  for (let i = 0; i < 60; i++)
    b.step({
      p0: { right: true, moveYaw: -Math.PI / 2, aimYaw: -Math.PI / 2 },
    });
  assert.ok(a.x > 5);
  assert.ok(Math.abs(a.z - 40) < 0.001);
  assert.ok(Math.abs(a.aim + Math.PI / 2) < 0.01);
  put(a, 0, 40);
  for (let i = 0; i < 60; i++)
    b.step({ p0: { forward: true, right: true, moveYaw: -Math.PI / 2 } });
  assert.equal(a.speed, 9);
  assert.ok(a.x > 0 && a.z < 40);
  b.map.obstacles = [{ id: "wall", floor: 0, x: 0, z: 35, w: 8, d: 1, h: 4 }];
  put(a, 0, 38);
  for (let i = 0; i < 15; i++)
    b.step({ p0: { forward: true, moveYaw: -Math.PI / 2, ability: true } });
  assert.ok(a.z > 36);
  assert.equal(b.damage(a, 20, "p1", a), true, "dodge gives no immunity");
  assert.equal(a.hp, 60);
  assert.throws(() => C.normalizeInput({ moveYaw: NaN }));
});
test('human absolute mouse aim snaps yaw and pitch before firing in PvP and PvE',()=>{
  for(const mode of ['pvp','pve']){
    const b=new C.Battle({mode,participants:[{id:'p0',controller:'human',tankType:'human',weaponType:'pistol'},
      ...(mode==='pvp'?[{id:'p1',controller:'human',tankType:'human',weaponType:'pistol'}]:[])]});
    b.start();const player=b.entities[0];
    Object.assign(player,{x:0,z:55,y:0,aim:0,pitch:0,cooldown:0});
    const yaw=Math.PI/2,pitch=.45;
    const shot=b.step({p0:{aimYaw:yaw,aimPitch:pitch,fire:true}}).find(e=>e.type==='shot'&&e.id==='p0');
    assert.ok(shot,mode+' fires on the same authority tick');
    assert.equal(player.aim,yaw,mode+' turns without easing');
    assert.equal(player.pitch,pitch,mode+' pitches without easing');
    assert.ok(Math.abs(shot.dx+Math.cos(yaw)*Math.cos(pitch))<1e-9);
    assert.ok(Math.abs(shot.dy-Math.sin(pitch))<1e-9);
    assert.ok(Math.abs(shot.dz-Math.sin(yaw)*Math.cos(pitch))<1e-9);
    S.validateSnapshot(b.snapshot());
  }
});
test('bot absolute aim and human keyboard-relative aim retain their original turn rates',()=>{
  const b=new C.Battle(),human=b.entities.find(e=>e.controller==='human'),bot=b.entities.find(e=>e.controller==='bot');
  b.start();bot.aim=bot.pitch=0;human.aim=0;
  const movement=require('../core/movement.js');
  movement.tickEntity(b,bot,C.normalizeInput({aimYaw:Math.PI/2,aimPitch:.4}));
  movement.tickEntity(b,human,C.normalizeInput({aimLeft:true}));
  assert.ok(Math.abs(bot.aim-1.8/C.TICK_RATE)<1e-9);
  assert.ok(Math.abs(bot.pitch-1.6/C.TICK_RATE)<1e-9);
  assert.ok(Math.abs(human.aim-1.8/C.TICK_RATE)<1e-9);
  S.validateSnapshot(b.snapshot());
});
test('charged laser uses the newest absolute mouse aim on the firing tick',()=>{
  const b=new C.Battle({participants:[
    {id:'p0',controller:'human',tankType:'human',weaponType:'laser'},
    {id:'p1',controller:'human',tankType:'heavy',weaponType:'standard'}]}),player=b.entities[0];
  b.start();
  put(player,0,55);
  Object.assign(player,{aim:0,pitch:0,charge:C.WEAPONS.laser.charge-1,fireHeld:true,cooldown:0});
  const yaw=-Math.PI/2,pitch=-.35;
  const events=b.step({p0:{fire:true,aimYaw:yaw,aimPitch:pitch}}),
    shot=events.find(e=>e.type==='shot'&&e.id==='p0'),
    beam=events.find(e=>e.type==='beam'&&e.id==='p0');
  assert.ok(shot&&beam,'the charged ray fires in this tick');
  assert.equal(player.aim,yaw);assert.equal(player.pitch,pitch);
  assert.ok(Math.abs(shot.dx+Math.cos(yaw)*Math.cos(pitch))<1e-9);
  assert.ok(Math.abs(shot.dy-Math.sin(pitch))<1e-9);
  assert.ok(Math.abs(shot.dz-Math.sin(yaw)*Math.cos(pitch))<1e-9);
  S.validateSnapshot(b.snapshot());
});
test("rocket direct hit applies 20 followed by full 80 explosion to the same target", () => {
  const b = battle(["medium", "heavy"]),
    [a, h] = b.entities;
  put(a, 0, 20);
  put(h, 0, 0);
  b.shoot(a);
  const damage = [];
  for (let i = 0; i < 60; i++)
    damage.push(
      ...b.step().filter((e) => e.type === "damage" && e.id === h.id),
    );
  assert.deepEqual(
    damage.map((e) => e.amount),
    [20, 80],
  );
  assert.equal(h.hp, 180);
  assert.equal(h.shield, 0);
  assert.equal(b.bullets.length, 0);
});
test("blast falls off with distance, has an eight metre radius and ignores other bodies as cover", () => {
  const b = battle(["medium", "medium", "medium", "medium"]);
  put(b.entities[0], 0, 20);
  put(b.entities[1], 2, 0);
  put(b.entities[2], 9, 0);
  put(b.entities[3], 12, 0);
  impact(b);
  const losses = b.entities
    .slice(1)
    .map((e) => e.maxHp + C.TANKS[e.tankType].shield - e.hp - e.shield);
  assert.equal(losses[0], 80);
  assert.ok(losses[1] > 0 && losses[1] < 80);
  assert.equal(losses[2], 0);
});
test("walls and floor slabs block blast propagation", () => {
  const b = battle(["medium", "medium"]);
  put(b.entities[0], 0, 20);
  put(b.entities[1], 6, 0);
  b.map.obstacles = [{ id: "wall", floor: 0, x: 3, z: 0, w: 1, d: 8, h: 4 }];
  impact(b);
  assert.equal(b.entities[1].shield, 0);
  assert.equal(b.entities[1].hp, 210);
  b.map.obstacles = [];
  put(b.entities[1], 0, 0, 1);
  impact(b, 0, 7.8, 0);
  assert.equal(b.entities[1].shield, 0);
  assert.equal(b.entities[1].hp, 210);
});
test("rocket self damage kills an unshielded human without awarding a self kill", () => {
  const b = battle();
  put(b.entities[0], 0, 0);
  put(b.entities[1], 20, 20);
  impact(b);
  assert.equal(b.entities[0].alive, false);
  assert.equal(b.entities[0].kills, 0);
  assert.equal(b.entities[0].deaths, 1);
});
test("human rocket loadout and explosion events pass authority replication and restore", () => {
  const a = new S.Authority({
      participants: C.defaultParticipants({
        tankType: "human",
        weaponType: "rocket",
      }).map((p) => ({ ...p, controller: "human" })),
    }),
    r = new S.Replica();
  r.welcome(a.attach("peer", "p1"));
  a.battle.start();
  assert.equal(r.receive(a.statePacket()).ok, true);
  const body = a.battle.entities[0];
  body.pitch = -0.55;
  a.battle.shoot(body);
  for (let i = 0; i < 60; i++) a.step();
  const packet = a.statePacket();
  assert.ok(packet.events.some((e) => e.type === "explosion"));
  assert.equal(r.receive(packet).ok, true);
  const copy = new C.Battle();
  copy.restore(packet.snapshot);
  assert.deepEqual(copy.snapshot(), packet.snapshot);
});

test("two full rocket direct hits kill light armour without passive shield regeneration", () => {
  const b = battle(["human", "light"]), [a, target] = b.entities;
  put(a, 0, 20); put(target, 0, 0);
  assert.deepEqual([target.hp, target.shield], [140, 0]);
  for (let shot = 0; shot < 2; shot++) {
    assert.equal(b.shoot(a), true);
    for (let tick = 0; tick < 90 && b.bullets.length; tick++) b.step();
    assert.equal(target.hp, shot ? 0 : 40);
    assert.equal(target.alive, shot === 0);
    if (!shot) for (let tick = 0; tick < 360; tick++) b.step();
  }
  assert.equal(target.shield, 0);
});
