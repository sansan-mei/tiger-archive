const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../battle-core.js');
function make({tank='medium',weapon='standard',obstacles=[],eight=false}={}){
  const map=C.clone(C.MAP);map.obstacles=obstacles;
  const participants=eight?C.defaultParticipants().map(p=>({...p,controller:'human'})):[
    {id:'p1',controller:'human',tankType:tank,weaponType:weapon,spawn:0},
    {id:'p2',controller:'human',tankType:'medium',weaponType:'standard',spawn:1}
  ];
  const b=new C.Battle({participants,map});b.start();return b;
}
function put(e,x,z,floor=0){Object.assign(e,{x,z,floor,y:C.MAP.levels[floor].y,speed:0});}
function ticks(b,n,inputs={}){const events=[];for(let i=0;i<n;i++)events.push(...b.step(inputs));return events;}
test('eight independently configured entities and all nine combinations are accepted',()=>{
  const b=make({eight:true});assert.equal(b.entities.length,8);
  for(const tank of Object.keys(C.TANKS))for(const weapon of Object.keys(C.WEAPONS)){
    const battle=make({tank,weapon});assert.equal(battle.entities[0].maxHp,C.TANKS[tank].hp);assert.equal(battle.entities[0].weaponType,weapon);
  }
  assert.throws(()=>new C.Battle({participants:[...C.defaultParticipants(),C.defaultParticipants()[0]]}));
  assert.throws(()=>make({tank:'unknown'}));
});
test('light / medium / heavy have distinct health, acceleration and maximum speed',()=>{
  const result=[];
  for(const tank of ['light','medium','heavy']){
    const b=make({tank});put(b.entities[0],0,50);
    ticks(b,60,{p1:{forward:true}});result.push({hp:b.entities[0].hp,speed:b.entities[0].speed});
  }
  assert.deepEqual(result,[{hp:140,speed:14},{hp:210,speed:11},{hp:280,speed:8}]);
});
test('reverse, braking, chassis turn and independent turret movement',()=>{
  const b=make(),p=b.entities[0];put(p,0,40);const heading=p.heading;
  ticks(b,30,{p1:{forward:true,aimYaw:0}});assert.ok(p.z<40);assert.equal(p.heading,heading);assert.notEqual(p.aim,heading);
  b.step({p1:{brake:true}});const z=p.z;assert.equal(p.speed,0);
  ticks(b,30,{p1:{reverse:true}});assert.ok(p.z>z);
  b.step({p1:{brake:true}});const x=p.x,z2=p.z;ticks(b,20,{p1:{left:true}});assert.equal(p.x,x);assert.equal(p.z,z2);assert.notEqual(p.heading,heading);
});
test('standard cannon has a server-enforced cooldown and nine hits defeat medium armour plus shield',()=>{
  const b=make(),p=b.entities[0],enemy=b.entities[1];put(p,0,30);put(enemy,0,-20);
  assert.equal(b.shoot(p),true);assert.equal(b.shoot(p),false);
  const events=ticks(b,620,{p1:{fire:true}});
  assert.equal(enemy.hp,0);assert.equal(p.kills,1);assert.equal(b.status,'playing');assert.equal(enemy.deaths,1);
  assert.equal(events.filter(e=>e.type==='end').length,0);
});
test('rapid cannon fires more often with lower damage',()=>{
  const b=make({weapon:'rapid'}),p=b.entities[0];put(p,0,40);p.aim=0;
  const events=ticks(b,60,{p1:{fire:true}});
  assert.equal(events.filter(e=>e.type==='shot').length,4);
  assert.equal(C.WEAPONS.rapid.damage,9);
  assert.ok(C.WEAPONS.rapid.damage<C.WEAPONS.standard.damage);
});
test('laser minimum charge, partial release, and maximum auto discharge',()=>{
  let b=make({weapon:'laser'}),p=b.entities[0];p.aim=0;
  let events=ticks(b,10,{p1:{fire:true}});events.push(...b.step({p1:{fire:false}}));
  assert.equal(events.filter(e=>e.type==='beam').length,0);assert.equal(p.charge,0);
  events=ticks(b,40,{p1:{fire:true}});events.push(...b.step({p1:{fire:false}}));
  assert.equal(events.filter(e=>e.type==='beam').length,1);
  assert.ok(events.find(e=>e.type==='beam').power<1);
  b=make({weapon:'laser'});p=b.entities[0];p.aim=0;
  events=ticks(b,300,{p1:{fire:true}});
  assert.equal(events.filter(e=>e.type==='beam').length,1);assert.equal(p.needsRelease,true);
  b.step({});events=ticks(b,90,{p1:{fire:true}});assert.equal(events.filter(e=>e.type==='beam').length,1);
});
test('continuous projectile collision and laser both respect cover',()=>{
  const cover={id:'wall',floor:0,x:0,z:0,w:10,d:.1,h:4};
  for(const weapon of ['standard','rapid','laser']){
    const b=make({weapon,obstacles:[cover]});put(b.entities[0],0,20);put(b.entities[1],0,-20);
    const events=ticks(b,120,{p1:{fire:true}});
    assert.equal(b.entities[1].hp,210);assert.ok(events.some(e=>e.type==='impact'&&e.kind==='cover'));
  }
});
test('barrel inside cover cannot shoot from the far side',()=>{
  const b=make({obstacles:[{id:'wall',floor:0,x:0,z:17,w:8,d:1,h:4}]});put(b.entities[0],0,20);put(b.entities[1],0,-20);
  assert.equal(b.shoot(b.entities[0]),true);assert.equal(b.bullets.length,0);assert.ok(b.events.some(e=>e.type==='impact'));
});
test('height-aware collision separates floors and floor slabs block a downward ray',()=>{
  const b=make();put(b.entities[0],0,20,0);put(b.entities[1],0,0,1);
  ticks(b,120,{p1:{fire:true}});assert.equal(b.entities[1].hp,210);
  const hit=b.collision({x:0,y:10,z:0},{x:0,y:2,z:0},'p2',{bodies:false});
  assert.equal(hit.kind,'floor');assert.equal(hit.id,1);
});
test('a shot outside the upper slab can hit a lower-floor tank',()=>{
  const b=make();put(b.entities[0],43,0,1);put(b.entities[1],58,0,0);
  const hit=b.collision({x:47,y:9,z:0},{x:58,y:1.8,z:0},'p1');
  assert.equal(hit.kind,'tank');assert.equal(hit.id,'p2');
});
test('all hulls drive continuously up and reverse down every ramp without interaction',()=>{
  for(const tank of Object.keys(C.TANKS))for(const r of C.MAP.ramps){
    const b=make({tank}),p=b.entities[0],sign=Math.sign(r.b.z-r.a.z);put(p,r.a.x,r.a.z-sign*4,r.a.floor);p.heading=sign<0?-Math.PI/2:Math.PI/2;
    let seen=false,previous=p.y;
    for(let i=0;i<420&&p.floor!==r.b.floor;i++){b.step({p1:{forward:true}});assert.ok(Math.abs(p.y-previous)<.08);previous=p.y;seen ||= !!p.rampId;}
    assert.ok(seen);assert.equal(p.floor,r.b.floor);assert.equal(p.y,C.MAP.levels[r.b.floor].y);
    b.step({p1:{brake:true}});
    for(let i=0;i<600&&(p.floor!==r.a.floor||p.rampId);i++)b.step({p1:{reverse:true}});
    assert.equal(p.floor,r.a.floor);assert.equal(p.rampId,null);assert.equal(p.y,C.MAP.levels[r.a.floor].y);
  }
});
test('ramp allows stopping, aiming, charging, firing and damage; interact grants no immunity',()=>{
  const b=make({weapon:'laser'}),p=b.entities[0];put(p,-36,32);ticks(b,100,{p1:{forward:true}});assert.ok(p.rampId);
  b.step({p1:{brake:true}});const position={x:p.x,y:p.y,z:p.z};
  const events=ticks(b,90,{p1:{brake:true,aimYaw:0,fire:true,interact:true}});
  assert.deepEqual({x:p.x,y:p.y,z:p.z},position);assert.ok(events.some(e=>e.type==='beam'));assert.notEqual(p.aim,p.heading);
  assert.equal(b.damage(p,10,'p2',position),true);assert.equal(p.hp,210);assert.equal(p.shield,80);
});
test('ramps block sideways entry, departure and driving through another tank',()=>{
  const b=make(),p=b.entities[0],other=b.entities[1];put(p,-36,32);ticks(b,100,{p1:{forward:true}});b.step({p1:{brake:true}});
  assert.equal(b.surface(p,-25,p.z),null);
  put(other,-20,16);assert.equal(b.surface(other,-32,16),null);
  put(other,p.x,p.z);other.y=p.y;assert.equal(b.valid(p.x,p.z,p.floor,p,{surface:{y:p.y}}),false);
});
test('upper deck has a real opening and ramp surface blocks downward shots',()=>{
  const b=make();const through=b.collision({x:-36,y:10,z:20},{x:-36,y:5,z:20},null,{bodies:false});assert.equal(through,null);
  const ground=b.collision({x:-36,y:5,z:20},{x:-36,y:1,z:20},null,{bodies:false});assert.equal(ground.kind,'ramp');
  const solid=b.collision({x:0,y:10,z:20},{x:0,y:5,z:20},null,{bodies:false});assert.equal(solid.kind,'floor');
});
test('slope entities remain hittable by projectiles and checkpoint determinism holds mid-ramp',()=>{
  const b=make(),p=b.entities[0];put(p,-36,32);ticks(b,100,{p1:{forward:true}});b.step({p1:{brake:true}});
  const hit=b.collision({x:p.x-5,y:p.y+2,z:p.z},{x:p.x+5,y:p.y+2,z:p.z},'p2');assert.equal(hit.kind,'tank');assert.equal(hit.id,'p1');
  const copy=make();copy.restore(b.snapshot());for(let i=0;i<90;i++)assert.deepEqual(b.step({p1:{reverse:true,fire:true}}),copy.step({p1:{reverse:true,fire:true}}));assert.deepEqual(b.snapshot(),copy.snapshot());
});
test('FFA damage applies to any other participant; no hardcoded player/enemy immunity',()=>{
  const b=make({eight:true}),a=b.entities[1],target=b.entities[2];
  assert.equal(b.damage(target,20,a.id,{x:target.x,y:target.y,z:target.z}),true);assert.equal(target.hp,target.maxHp);assert.equal(target.shield,C.TANKS[target.tankType].shield-20);
});
test('fixed-tick checkpoint restore produces an identical continuation',()=>{
  const a=make();ticks(a,40,{p1:{forward:true,fire:true}});
  const saved=JSON.parse(JSON.stringify(a.snapshot())),b=make();b.restore(saved);
  const inputs={p1:{left:true,fire:true},p2:{forward:true}};
  for(let i=0;i<90;i++)assert.deepEqual(a.step(inputs),b.step(inputs));
  assert.deepEqual(a.snapshot(),b.snapshot());
});
test('pause and finished match freeze all authority state',()=>{
  const b=make();ticks(b,20,{p1:{fire:true}});b.pause();
  const saved=b.snapshot();ticks(b,100,{p1:{forward:true,fire:true}});assert.deepEqual(b.snapshot(),saved);
  b.start();b.entities[0].kills=14;b.damage(b.entities[1],10000,'p1',{x:0,y:0,z:0});b.step();const final=b.snapshot();ticks(b,30);assert.deepEqual(b.snapshot(),final);
});
test('input schema rejects direct health, loadout changes, NaN and invalid flags',()=>{
  for(const input of [{hp:999},{weaponType:'laser'},{forward:1},{aimYaw:NaN},{aimPitch:4},{fire:'yes'}])assert.throws(()=>C.normalizeInput(input));
});
test('map boundaries, cover and same-floor vehicle collision are authoritative',()=>{
  const b=new C.Battle();const p=b.entities[0];
  assert.equal(b.valid(64,0,0,p),false);assert.equal(b.valid(-17,11,0,p),false);
  const other=b.entities[1];assert.equal(b.valid(other.x,other.z,other.floor,p),false);
  assert.equal(b.valid(0,0,1,p),true);
});
test('AI actually drives along a ramp to chase an upper-floor target',()=>{
  const b=new C.Battle();b.start();const body=b.entities[1],target=b.entities[0];
  put(body,-36,35,0);body.heading=-Math.PI/2;put(target,0,-35,1);target.hp=target.maxHp=9999;
  for(const e of b.entities)if(e!==body&&e!==target){e.alive=false;e.hp=0;}
  let entered=false;for(let i=0;i<1000&&body.floor!==1;i++){b.step();entered ||= !!body.rampId;}
  assert.ok(entered);assert.equal(body.floor,1);
});

test('default eight-vehicle match completes within five minutes with repeated AI kills',()=>{
  const b=new C.Battle();b.start();let transitions=0,destroyed=0;
  for(let i=0;i<C.RULES.duration&&b.status==='playing';i++){
    for(const e of b.step({})){if(e.type==='rampExit')transitions++;if(e.type==='destroy')destroyed++;}
  }
  assert.equal(b.status,'finished');assert.ok(destroyed>7);
  assert.ok(b.tick<=C.RULES.duration);
});
test('A* escapes a valid wall-adjacent position whose nearest cell is blocked',()=>{
  const b=new C.Battle(),body=b.entities[2];put(body,22.73,3.45,1);
  assert.equal(b.valid(body.x,body.z,body.floor,body),true);
  const route=b.route(body,{x:11.4,z:-11});assert.ok(route.length>0);
  assert.ok(route.every(p=>b.valid(p.x,p.z,1,body,{ignoreEntities:true})));
});
