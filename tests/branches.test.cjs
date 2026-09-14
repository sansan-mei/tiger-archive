const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),R=C.PVE.progression,B=R.branches;
function make(weapon='pistol',tier=5) {
  const b=new C.Battle({mode:'pve',participants:[{id:'p',controller:'human',tankType:'human',weaponType:'pistol'}]});
  b.start();b.pve.nextWaveAt=100000;b.pve.wave=4;
  for(const e of b.entities.filter(e=>e.tankType==='zombie'))e.maxHp=C.PVE.healthFor(e.zombieType,1,4);
  const p=b.entities[0];Object.assign(p,{weaponType:weapon,x:0,z:55,y:0,floor:0,aim:0,pitch:0,protectedUntil:0,ammo:C.WEAPONS[weapon].magazineSize||0});
  const route=B.routes.find(r=>r.weapon===weapon&&B.rewards[r.keys[0]]),u=b.pve.upgrades.p;
  if(tier){u[route.shared]=1;for(const key of route.keys.slice(0,tier-1))u[key]=1;}
  if(u.lightMagazine){p.ammo=4;B.reload(b,p);}
  return {b,p,u,s:b.pve.branchState.p,route};
}
function enemy(b,i,x=-8,z=55,type='bucket') {
  const e=b.entities[i+1];Object.assign(e,{x,z,y:0,floor:0,zombieType:type,alive:true,protectedUntil:0,shield:0,barrier:0,
    maxHp:C.PVE.healthFor(type,1,b.pve.wave)});e.hp=e.maxHp;return e;
}
function hit(b,p,target,extra={}) {
  const shot={id:100,owner:p.id,ownerLife:p.deaths,weaponType:p.weaponType,damage:C.WEAPONS[p.weaponType].damage,critical:false,dx:-1,dy:0,dz:0,...extra};
  b.resolveHit({kind:'tank',id:target.id,point:{x:target.x+.1,y:1.5,z:target.z}},shot);return shot;
}
test('five forks offer both branches, lock on selection, reject forged opposite choice and preserve progress after switching',()=>{
  for(const weapon of ['pistol','standard','rapid','laser','rocket']) {
    const {b,p,u,route}=make(weapon,1),pair=B.routes.filter(r=>r.weapon===weapon);
    b.pve.pending.p=1;R.offer(b,p,C.PVE.rewards);
    assert.deepEqual(b.pve.choices.p.slice(0,2),pair.map(r=>r.keys[0]));
    assert.ok(b.chooseUpgrade('p',0,route.keys[0]));
    const old=pair.find(r=>r!==route).keys[0];
    b.pve.pending.p=1;b.pve.choices.p=[old,'regen','haste'];b.pve.choiceIds.p=b.pve.nextChoiceId++;
    assert.equal(b.chooseUpgrade('p',0,old),false);
    delete b.pve.choices.p;R.offer(b,p,C.PVE.rewards);
    assert.ok(!b.pve.choices.p.includes(old));
    const nextWeapon=weapon==='pistol'?'rocket':'pistol';
    b.pve.choices.p=[nextWeapon,'regen','haste'];
    assert.ok(b.chooseUpgrade('p',0,nextWeapon));assert.equal(u[route.keys[0]],1);
    b.pve.pending.p=1;b.pve.choices.p=[weapon,'regen','haste'];b.pve.choiceIds.p=b.pve.nextChoiceId++;
    assert.ok(b.chooseUpgrade('p',0,weapon));assert.equal(p.weaponType,weapon);assert.equal(u[route.keys[0]],1);
    S.validateSnapshot(b.snapshot());
    const bad=b.snapshot();bad.pve.upgrades.p[old]=1;
    assert.throws(()=>S.validateSnapshot(bad),/Conflicting/);
  }
});
test('quick reload uses four rounds and confirmed boosted shots; refunds and burst extensions are capped',()=>{
  const {b,p,s}=make();
  b.shoot(p);assert.equal(b.bullets[0].damage,30);assert.equal(b.bullets[0].branchBoost,true);
  S.validateSnapshot(b.snapshot());
  b.bullets=[];p.ammo=0;p.cooldown=1;
  b.tickEntity(p,{});assert.equal(p.ammo,4);assert.equal(s.bonus,2);
  for(let i=0;i<8;i++){const target=enemy(b,0);target.hp=1;hit(b,p,target,{damage:30,branchBoost:true});}
  assert.equal(s.refunds,2);assert.ok(p.ammo<=4);assert.equal(s.burstUntil,180);
  const q=enemy(b,1,-9),before=q.hp;
  const target=enemy(b,0,-6);hit(b,p,target,{damage:30,branchBoost:true});assert.ok(q.hp<before);
  const saved=b.snapshot(),copy=make().b;copy.restore(saved);S.validateSnapshot(saved);
  assert.deepEqual(copy.pve.branchState,b.pve.branchState);
});
test('scatter adds bounded close-range hits, knocks enemies back without entering walls, and leaves distant targets alone',()=>{
  const {b,p}=make('standard'),near=enemy(b,0,-5),far=enemy(b,1,-20);
  const hp=near.hp,farHp=far.hp;
  b.shoot(p);
  assert.ok(near.hp<hp);assert.ok(near.x<-5);assert.equal(far.hp,farHp);
  assert.ok(b.events.filter(e=>e.type==='beam').length===5);
  assert.ok(b.valid(near.x,near.z,near.floor,near));
  S.validateSnapshot(b.snapshot());
});
test('bipod builds up only when firing in place; guarded crawl retains deployment and switching cannot refresh shield',()=>{
  const {b,p,s}=make('rapid');
  for(let i=0;i<90;i++){b.tick++;B.move(b,p,{fire:true});}
  assert.equal(s.deploy,90);assert.equal(s.guard,25);assert.equal(b.pveWeapon(p).cooldown,Math.round(C.WEAPONS.rapid.cooldown/2));
  const z=enemy(b,0);b.damage(p,30,z.id,{x:p.x,y:1.5,z:p.z});assert.equal(p.hp,75);assert.equal(s.guard,0);
  B.move(b,p,{fire:true,forward:true,brake:true});assert.equal(s.deploy,90);
  B.move(b,p,{fire:true,forward:true});assert.equal(s.deploy,84);
  const ready=s.guardReady;B.reset(b,p);b.pve.branchState.p.deploy=89;B.move(b,p,{fire:true});
  assert.equal(b.pve.branchState.p.guard,0);assert.equal(b.pve.branchState.p.guardReady,ready);
  S.validateSnapshot(b.snapshot());
});
test('charged laser waits for release, cancel does not fire, full charge creates a clipped trail and delayed echo',()=>{
  const {b,p,s}=make('laser');
  for(let i=0;i<150;i++)b.tickEntity(p,{fire:true});
  assert.equal(p.charge,120);assert.equal(b.events.filter(e=>e.type==='shot').length,0);
  b.tickEntity(p,{cancelFire:true});assert.equal(p.charge,0);assert.equal(b.events.filter(e=>e.type==='shot').length,0);
  b.tickEntity(p,{});
  for(let i=0;i<120;i++)b.tickEntity(p,{fire:true});
  b.tickEntity(p,{});
  assert.equal(b.events.filter(e=>e.type==='shot').length,1);assert.equal(b.pve.branchZones.length,1);assert.equal(b.pve.branchEchoes.length,1);
  S.validateSnapshot(b.snapshot());
  const copy=make('laser').b;copy.restore(b.snapshot());
  for(let i=0;i<30;i++){b.step();copy.step();}
  assert.deepEqual(copy.snapshot(),b.snapshot());assert.equal(b.pve.branchEchoes.length,0);
  assert.ok(b.events.some(e=>e.type==='beam'&&e.radius===1.5));
  S.validateSnapshot(b.snapshot());
  p.cooldown=0;s.chargeReady=1;b.tickEntity(p,{fire:true});assert.equal(b.pveWeapon(p).charge,72);
  for(let i=1;i<100;i++)b.tickEntity(p,{fire:true});
  assert.equal(p.charge,72);assert.equal(b.events.filter(e=>e.type==='shot').length,0);
  b.tickEntity(p,{});assert.equal(b.pveWeapon(p).charge,120);
  assert.equal(b.pve.branchEchoes.length,1);
});
test('laser energy return requires full charge and three targets; quick taps cannot create trails',()=>{
  const {b,p,s}=make('laser');
  for(let i=0;i<3;i++)enemy(b,i,-6-i*5);
  b.tickEntity(p,{fire:true});b.tickEntity(p,{});assert.equal(b.pve.branchZones.length,0);assert.equal(s.chargeReady,0);
  p.cooldown=0;
  for(let i=0;i<120;i++)b.tickEntity(p,{fire:true});b.tickEntity(p,{});
  assert.equal(s.chargeReady,1);assert.equal(b.pve.branchZones.length,1);
});
test('starfall deals 120 damage at tick 30 while the trail retains its six 20-damage ticks',()=>{
  const {b,p}=make('laser');
  for(let i=0;i<120;i++)b.tickEntity(p,{fire:true});b.tickEntity(p,{});
  const zone=b.pve.branchZones[0];
  assert.equal(zone.damage,20);assert.equal(zone.until,180);assert.equal(zone.nextTick,30);
  assert.equal(b.pve.branchEchoes[0].at,30);
  // Spawn after the direct shot so echo and trail damage can be measured independently.
  const target=enemy(b,0,-8,56.2),hp=target.hp;
  b.tick=29;B.tick(b);assert.equal(target.hp,hp);
  b.tick=30;B.tick(b);assert.equal(target.hp,hp-120);
  target.z=55;
  assert.equal(b.pve.branchEchoes.length,0);
  for(let tick=60;tick<=180;tick+=30) {
    target.hp=hp;b.tick=tick-1;B.tick(b);assert.equal(target.hp,hp);
    b.tick=tick;B.tick(b);assert.equal(target.hp,hp-20);
  }
  assert.equal(b.pve.branchZones.length,0);
});
test('charge-route checkpoints and replica accept the effective charge cap and reject overflow',()=>{
  for(const ready of [0,1]) {
    const {b,p,s}=make('laser'),cap=ready?72:120;s.chargeReady=ready;
    const a=new S.Authority(),r=new S.Replica();a.battle=b;
    r.welcome(a.attach('peer',p.id));
    for(let tick=1;tick<=cap;tick++) {
      b.step({p:{fire:true}});
      assert.equal(p.charge,tick);
      S.validateSnapshot(b.snapshot());
      const result=r.receive(a.statePacket({network:true}));assert.equal(result.ok,true,result.reason);
    }
    const saved=b.snapshot(),copy=make('laser').b;copy.restore(saved);
    const bad=b.snapshot();bad.entities[0].charge=cap+1;
    assert.throws(()=>S.validateSnapshot(bad),/Invalid entity/);
    for(let tick=0;tick<32;tick++) {
      b.step();copy.step();assert.deepEqual(copy.snapshot(),b.snapshot());
      S.validateSnapshot(b.snapshot());
    }
  }
  const {b,p}=make('laser',0);p.charge=91;
  assert.throws(()=>S.validateSnapshot(b.snapshot()),/Invalid entity/);
});
test('charge visuals and HUD use normal, returned and baseline laser charge durations',()=>{
  const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),T=require('three');
  const nodes=new Map(),context2d=new Proxy({}, {get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  const element=()=>({style:{},dataset:{},replaceChildren(){},getContext:()=>context2d});
  const $=id=>{if(!nodes.has(id))nodes.set(id,element());return nodes.get(id);};
  const ctx=vm.createContext({window:{innerWidth:1280,innerHeight:800,TankBattle:C},document:{createElement:element}});
  for(const file of ['core/abilities.js','plugins/registry.js','plugins/tanks/common.js',...require('../app-manifest.js').plugins,
    'tank-model.js','client/recoil.js','client/units.js','client/hud.js'])
    vm.runInContext(fs.readFileSync(path.join(__dirname,'..',file),'utf8'),ctx);
  for(const [tier,ready,cap] of [[5,0,120],[5,1,72],[0,0,90]]) {
    const {b,p,s}=make('laser',tier);s.chargeReady=ready;
    const units=ctx.window.TankClient.createUnits({T,C,scene:new T.Scene(),floorGroups:[],reduced:true,effects:[],sound(){},
      getEntities:()=>[p],getPlayerId:()=>p.id});
    units.createViews();
    const hud=ctx.window.TankClient.createHUD({C,$,getPlayerId:()=>p.id});
    for(const ratio of [.5,1]) {
      p.charge=cap*ratio;
      const truth=b.snapshot(),state={...truth,entities:[p]};
      units.update({state,truth,cameraFloor:0,camera:new T.PerspectiveCamera(),dt:1/60,time:0});
      const view=units.views.get(p.id);
      assert.ok(Math.abs(view.warning.material.opacity-(.35+.45*ratio))<1e-10);
      assert.equal(view.glow.emissiveIntensity,1+ratio*5);
      hud.update({truth,p,state,target:p});
      assert.equal($('reload-bar').value,ratio);
      assert.match($('reload-label').textContent,new RegExp(`${ratio*100}%`));
    }
  }
});
test('charge balance v40 rejects v39 checkpoints and welcomes',()=>{
  assert.equal(C.VERSION,40);
  const {b}=make('laser'),old=b.snapshot();old.version=39;
  assert.throws(()=>S.validateSnapshot(old),/Invalid snapshot header/);
  assert.throws(()=>b.restore(old),/snapshot/i);
  const a=new S.Authority();a.battle=b;
  const welcome=a.attach('peer','p');welcome.version=39;
  assert.throws(()=>new S.Replica().welcome(welcome));
});
test('napalm reduces direct damage, caps fire zones and ignites only one generation of embers',()=>{
  const {b,p}=make('rocket');
  b.shoot(p);assert.equal(b.bullets[0].damage,Math.round(C.WEAPONS.rocket.damage*.6));
  S.validateSnapshot(b.snapshot());
  b.bullets=[];
  for(let i=0;i<3;i++){p.cooldown=0;b.shoot(p);}
  const shot=b.bullets.find(s=>s.branchInferno);assert.ok(shot);
  B.fireZone(b,{point:{x:-8,y:1.5,z:55}},shot);
  assert.equal(b.pve.branchZones[0].radius,8);
  const victim=enemy(b,0,-8);victim.hp=1;
  b.tick=30;B.tick(b);assert.equal(b.pve.branchZones.length,2);assert.equal(b.pve.branchZones[1].spread,false);
  b.pve.branchZones=b.pve.branchZones.slice(1);
  const second=enemy(b,1,-8);second.hp=1;b.tick=60;B.tick(b);assert.equal(b.pve.branchZones.length,1);
  for(let i=0;i<50;i++)B.fireZone(b,{point:{x:-8,y:1.5,z:55}},shot);
  assert.equal(b.pve.branchZones.length,24);
  b.bullets=[];S.validateSnapshot(b.snapshot());
  p.weaponType='pistol';B.tick(b);assert.equal(b.pve.branchZones.length,0);
});
test('branch checkpoint rejects forged timers, effect budgets and malformed projectile flags',()=>{
  const {b,p}=make();b.shoot(p);
  for(const mutate of [s=>s.pve.branchState.p.guard=100,s=>s.pve.branchState.p.deploy=91,
    s=>s.pve.branchEchoes=Array(9).fill({}),s=>s.bullets[0].branchBoost='yes',s=>s.bullets[0].damage=999]) {
    const snap=b.snapshot();mutate(snap);assert.throws(()=>S.validateSnapshot(snap));
  }
});
test('wide laser and its echo can graze floors but solid cover and downward ground aim still stop them',()=>{
  const {b,p}=make('laser'),target=enemy(b,0,-8),from=C.shotOrigin(p),to={...from,x:-16};
  const hit=b.collision(from,to,p.id,{radius:1.5,floorRadius:.5});assert.equal(hit.kind,'tank');
  b.map.obstacles.push({id:'test-wall',floor:0,x:-4,z:55,w:1,d:8,h:5});
  assert.equal(b.collision(from,to,p.id,{radius:1.5,floorRadius:.5}).kind,'cover');
  const hp=target.hp;b.shoot(p);assert.equal(target.hp,hp);
  b.tick=30;B.tick(b);assert.equal(target.hp,hp);
  b.map.obstacles=[];
  const ground=b.collision(from,{...to,y:-5},p.id,{bodies:false,radius:1.5,floorRadius:.5});assert.equal(ground.kind,'floor');
});
test('scorch stacks only while continuously inside a fire zone and ember deaths clear pooled-slot stacks',()=>{
  const {b,p}=make('rocket'),target=enemy(b,0,-8);
  B.fireZone(b,{point:{x:-8,y:1.5,z:55}},{owner:p.id,ownerLife:0,weaponType:'rocket',dx:-1,dy:0,dz:0});
  const hp=target.hp;
  b.tick=30;B.tick(b);assert.equal(target.hp,hp-20);
  b.tick=60;B.tick(b);assert.equal(target.hp,hp-45);
  target.z=65;b.tick=90;B.tick(b);target.z=55;
  b.tick=120;B.tick(b);assert.equal(target.hp,hp-65);
  b.damage(target,10000,p.id,target);assert.equal(b.pve.branchZones[0].stacks[target.id],undefined);
});
test('eight players with maximum fire zones remain within network packet bounds',()=>{
  const b=new C.Battle({mode:'pve',participants:Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol',spawn:i}))});b.start();
  for(const p of b.entities.slice(0,8)) {
    p.weaponType='rocket';p.ammo=0;
    for(const key of ['blast','napalm','embers','scorch','inferno'])b.pve.upgrades[p.id][key]=1;
    for(let i=0;i<3;i++)B.fireZone(b,{point:{x:p.x,y:1.5,z:p.z}},{owner:p.id,ownerLife:0,weaponType:'rocket',dx:-1,dy:0,dz:0,branchInferno:true});
  }
  for(const area of b.pve.branchZones)for(const z of b.entities.slice(8))area.stacks[z.id]=4;
  assert.equal(b.pve.branchZones.length,24);
  S.validateSnapshot(b.snapshot());S.validateSnapshot(b.networkSnapshot(),{network:true});
  const bytes=Buffer.byteLength(JSON.stringify(b.networkSnapshot()));assert.ok(bytes<65536,bytes+' bytes');
});
test('ending the run and switching away cancel scheduled branch effects immediately',()=>{
  const {b,p}=make('laser');b.shoot(p);assert.equal(b.pve.branchEchoes.length,1);
  B.reset(b,p);assert.equal(b.pve.branchZones.length,0);assert.equal(b.pve.branchEchoes.length,0);
  p.cooldown=0;b.shoot(p);b.tick=29;
  p.hp=0;p.alive=false;p.deaths++;b.step();
  assert.equal(b.status,'finished');assert.equal(b.pve.branchZones.length,0);assert.equal(b.pve.branchEchoes.length,0);
  S.validateSnapshot(b.snapshot());
});
test('new branch beam events and boosted projectiles are accepted by an actual replica',()=>{
  for(const weapon of ['pistol','standard','rapid','laser','rocket']) {
    const {b,p,s}=make(weapon),a=new S.Authority(),r=new S.Replica();a.battle=b;
    r.welcome(a.attach('peer',p.id));
    if(weapon==='rapid')s.deploy=90;
    b.shoot(p);a.history.push(...b.events);
    const result=r.receive(a.statePacket({network:true}));
    assert.equal(result.ok,true,weapon+': '+result.reason);
  }
});
test('secondary branch kills do not recursively trigger module death explosions',()=>{
  const {b,p,u}=make('standard'),target=enemy(b,0,-5);
  target.hp=1;u.modFracture=1;u.modReprisal=1;
  b.pve.moduleStatus[target.id]={burnUntil:0,burnNext:0,burnOwner:null,fractureUntil:240,fractureOwner:p.id};
  B.afterShot(b,p,{},C.shotOrigin(p));
  assert.equal(target.alive,false);assert.equal(b.events.filter(e=>e.type==='explosion').length,0);
  assert.ok(!b.moduleSecondary);
});
test('all five alternate routes stay protocol-valid during live movement, firing and charge-release simulation',()=>{
  for(const weapon of ['pistol','standard','rapid','laser','rocket']) {
    const {b,p}=make(weapon);
    for(let i=0;i<8;i++)enemy(b,i,-8-i*3,55+(i%2)*3);
    for(let tick=0;tick<240;tick++) {
      b.step({p:{fire:weapon==='laser'?tick%150<125:true,forward:tick>180,brake:weapon==='rapid',aimYaw:0,aimPitch:0}});
      if(tick%10===0)S.validateSnapshot(b.networkSnapshot(),{network:true});
    }
    S.validateSnapshot(b.snapshot());
  }
});
