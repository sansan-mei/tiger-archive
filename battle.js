/* Rendering consumes replica snapshots; inputs go through the same authority boundary as future peers. */
(() => {
  'use strict';
  const $=id=>document.getElementById(id),startButton=$('start-button');
  function failure(message){$('game-overlay').hidden=false;$('load-error').hidden=false;$('load-error').textContent=message;startButton.disabled=true;startButton.textContent='战场未能加载';}
  if(!window.THREE||!window.TankSession||!window.createTankModel){failure('3D 组件加载失败，请联网后刷新页面。');return;}
  const T=window.THREE,C=window.TankBattle,canvas=$('battle-canvas');
  let renderer;
  try{renderer=new T.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});}catch{failure('无法创建 WebGL 画面，请检查浏览器硬件加速。');return;}
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,1.5));renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene();scene.background=new T.Color(0x8cbedf);scene.fog=new T.Fog(0xcad9ce,115,260);
  const camera=new T.PerspectiveCamera(65,1,.1,300);
  scene.add(new T.HemisphereLight(0xfff5e5,0x648a7a,1.8));
  const sun=new T.DirectionalLight(0xffecd1,2.4);sun.position.set(-36,48,28);sun.castShadow=true;
  sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-45,right:45,top:45,bottom:-45,near:1,far:160});sun.shadow.normalBias=.06;sun.shadow.bias=-.0002;scene.add(sun);scene.add(sun.target);
  const mat=color=>new T.MeshToonMaterial({color});
  const turf=mat(0x709c78),road=mat(0x839da6),wall=mat(0xcbbfac),dark=mat(0x627e73),stripe=mat(0xf1d89b),rampMat=mat(0xb8b8a0);
  const geometry=new T.BoxGeometry(1,1,1),floorGroups=C.MAP.levels.map(()=>new T.Group());
  floorGroups.forEach(g=>scene.add(g));
  function block(w,h,d,x,y,z,material,parent){
    const m=new T.Mesh(geometry,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;(parent||scene).add(m);return m;
  }
  for(const level of C.MAP.levels){
    const group=floorGroups[level.id],b=level.bound;
    for(const q of C.deckRects(C.MAP,level))block(q.x1-q.x0,.6,q.z1-q.z0,(q.x0+q.x1)/2,level.y-.3,(q.z0+q.z1)/2,level.id?road:turf,group);
    block(11,.02,b*2-2,0,level.y+.015,0,road,group);
    for(let n=-b+3;n<b;n+=8)for(const side of [-1,1]){
      block(1,.9,5,side*(b+.2),level.y+.45,n,dark,group);
      block(5,.9,1,n,level.y+.45,side*(b+.2),dark,group);
    }
    if(level.id)for(const x of [-44,44])for(const z of [-44,44])block(1.1,8,1.1,x,level.y-4,z,dark,group);
    for(const o of C.MAP.obstacles.filter(o=>o.floor===level.id)){
      block(o.w,o.h,o.d,o.x,level.y+o.h/2,o.z,wall,group);
      block(o.w+.2,.16,o.d+.2,o.x,level.y+o.h+.08,o.z,dark,group);
      // Painted panels remain inside the authoritative cover footprint.
      for(let x=o.x-o.w/2+1.4;x<o.x+o.w/2-1;x+=2.5){
        block(.9,.9,.04,x,level.y+o.h*.6,o.z+o.d/2+.03,dark,group);
        block(1.1,.09,.15,x,level.y+o.h*.6-.5,o.z+o.d/2+.06,stripe,group);
      }
      for(const side of [-1,1])block(.30,.5,o.d+.06,o.x+side*(o.w/2-.3),level.y+o.h*.6,o.z,stripe,group);
    }
  }
  for(const ramp of C.MAP.ramps){
    const a=ramp.a,b=ramp.b,low=C.MAP.levels[a.floor].y,high=C.MAP.levels[b.floor].y;
    const length=Math.hypot(b.z-a.z,high-low),angle=-Math.atan((high-low)/(b.z-a.z));
    const deck=block(ramp.width,.6,length,a.x,(low+high)/2-.3,(a.z+b.z)/2,rampMat,floorGroups[a.floor]);deck.rotation.x=angle;
    for(const side of [-1,1]){
      const rail=block(.24,.65,length,a.x+side*(ramp.width/2-.12),(low+high)/2+.35,(a.z+b.z)/2,stripe,floorGroups[a.floor]);rail.rotation.x=angle;
    }
    for(const point of [a,b]){
      const ring=new T.Mesh(new T.RingGeometry(3.3,3.55,40),new T.MeshBasicMaterial({color:0x8ff0ce,side:T.DoubleSide,transparent:true,opacity:.7}));
      ring.rotation.x=-Math.PI/2;ring.position.set(point.x,C.MAP.levels[point.floor].y+.05,point.z);floorGroups[point.floor].add(ring);
    }
  }
  // Original low-poly scenery, outside the playable boundary: warm summer outskirts.
  const scenery=new T.Group();scene.add(scenery);
  const leafGeometry=new T.IcosahedronGeometry(1,0),treeTrunk=new T.CylinderGeometry(.25,.38,1,5);
  const foliage=new T.InstancedMesh(leafGeometry,mat(0xffffff),72),trunks=new T.InstancedMesh(treeTrunk,mat(0x8c8970),24);
  const transform=new T.Object3D();foliage.castShadow=true;foliage.receiveShadow=true;trunks.castShadow=true;
  for(let i=0;i<24;i++){
    const angle=i/24*Math.PI*2,ring=79+(i%4)*5,x=Math.cos(angle)*ring,z=Math.sin(angle)*ring;
    transform.position.set(x,3.1,z);transform.rotation.set(0,0,0);transform.scale.set(1,6.2,1);transform.updateMatrix();trunks.setMatrixAt(i,transform.matrix);
    for(let j=0;j<3;j++){
      transform.position.set(x+Math.cos(j*2.1)*2,7+j*.8,z+Math.sin(j*2.1)*2);
      transform.rotation.set(i*.2,j*.6,i*.07);transform.scale.set(4.3+j*.5,4+j*.35,4.5);transform.updateMatrix();foliage.setMatrixAt(i*3+j,transform.matrix);
      foliage.setColorAt(i*3+j,new T.Color([0x739b7c,0x91ac83,0x5d8977][(i+j)%3]));
    }
  }
  scenery.add(foliage,trunks);
  const meadow=block(450,.7,450,0,-1.1,0,mat(0x9ab48b),scenery);
  for(let i=0;i<12;i++){
    const angle=i/12*Math.PI*2,hill=new T.Mesh(leafGeometry,mat(i%2?0x9eb58d:0x87aa91));
    hill.position.set(Math.cos(angle)*150,-1,Math.sin(angle)*150);hill.scale.set(35,18+i%4*5,31);hill.rotation.y=angle;scenery.add(hill);
  }
  const stucco=mat(0xe9d5b0),terracotta=mat(0xcb907b),windowPaint=mat(0x739198);
  for(const side of [-1,1])for(let i=0;i<3;i++){
    const house=new T.Group();house.position.set(side*(100+i%2*9),0,-55+i*48);house.rotation.y=side*Math.PI/2;scenery.add(house);
    block(12,7,9,0,2.5,0,stucco,house);
    const roof=new T.Mesh(new T.ConeGeometry(9,3.2,4),terracotta);roof.rotation.y=Math.PI/4;roof.position.y=7.6;roof.scale.z=.8;house.add(roof);
    for(const x of [-3,3])block(2,2,.12,x,3,4.56,windowPaint,house);
    block(1.5,2.8,.12,0,.8,4.56,windowPaint,house);
  }
  const clouds=new T.Group();scene.add(clouds);
  const cloudMaterial=new T.MeshBasicMaterial({color:0xffe6b6,fog:false});
  const cloudMesh=new T.InstancedMesh(new T.IcosahedronGeometry(1,1),cloudMaterial,36);
  for(let i=0;i<36;i++){
    const cluster=Math.floor(i/4),j=i%4,angle=cluster/9*Math.PI*2;
    transform.position.set(Math.cos(angle)*160+j*6,55+cluster%3*8+(j%2)*2,Math.sin(angle)*160);
    transform.rotation.set(0,j*.5,0);transform.scale.set(10+j%2*3,4+j%3,7);transform.updateMatrix();cloudMesh.setMatrixAt(i,transform.matrix);
  }
  clouds.add(cloudMesh);
  let session=new window.TankSession.LocalSession(),network=null;
  let snapshot=session.current(),playerId=session.playerId;
  const views=new Map(),bullets=new Map(),effects=[],palette=[0xa8b58a,0xc78772,0x87a9bf,0xd1b775,0xa393b2,0x73a89a,0xd49e75,0x91a5ae];
  const sphere=new T.IcosahedronGeometry(1,0),shellMat=new T.MeshBasicMaterial({color:0xffd18a});
  const labelHost=$('enemy-labels');
  function createViews(){
    for(const view of views.values()){scene.remove(view.tank);view.label?.remove();view.dispose();}views.clear();
    session.current().entities.forEach((body,i)=>{
      const view=window.createTankModel(T,{tankType:body.tankType,weaponType:body.weaponType,color:palette[i]});
      view.tank.traverse(o=>{o.userData.entityId=body.id;});scene.add(view.tank);
      if(body.id!==playerId){
        const label=document.createElement('div');label.className='enemy-tag';
        const text=document.createElement('span');text.textContent=body.id+' / '+C.TANKS[body.tankType].name;
        const bar=document.createElement('div'),fill=document.createElement('i');bar.appendChild(fill);label.append(text,bar);labelHost.appendChild(label);
        view.label=label;view.bar=fill;
      }
      views.set(body.id,view);
    });
  }
  createViews();
  let hitTime=0,damageTime=0,noticeTime=0,audio=null,deathShown=false,observing=false,attackerId=null,engine=null,engineGain=null;
  const pickupViews=C.MAP.pickups.map(p=>{
    const group=new T.Group(),material=mat(p.kind==='repair'?0x73cfa2:0xefbe62);
    block(1.5,1.5,1.5,0,0,0,material,group);
    if(p.kind==='repair'){block(.25,1,.04,0,0,.77,stripe,group);block(1,.25,.04,0,0,.78,stripe,group);}
    else{block(.25,1,.04,-.25,0,.77,stripe,group);block(.25,1,.04,.25,0,.77,stripe,group);}
    group.position.set(p.x,C.MAP.levels[p.floor].y+1.3,p.z);floorGroups[p.floor].add(group);return group;
  });
  const reduced=window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  function sound(laser=false,volume=1){
    if(!audio||audio.state!=='running')return;
    const at=audio.currentTime,o=audio.createOscillator(),g=audio.createGain();o.type=laser?'sine':'triangle';
    o.frequency.setValueAtTime(laser?550:140,at);o.frequency.exponentialRampToValueAtTime(laser?100:28,at+.2);
    g.gain.setValueAtTime(.055*volume,at);g.gain.exponentialRampToValueAtTime(.001,at+.23);o.connect(g);g.connect(audio.destination);o.start(at);o.stop(at+.24);
  }
  function puff(point,size=1,count=6){
    for(let i=0;i<count;i++){
      const material=new T.MeshBasicMaterial({color:i%3?0xeaa15a:0x555d4c,transparent:true,opacity:1});
      const m=new T.Mesh(sphere,material);m.position.set(point.x,point.y,point.z);m.scale.setScalar(.2*size);scene.add(m);
      effects.push({m,age:0,life:.5+size*.25,size,dx:Math.cos(i/count*6.28)*size*3,dz:Math.sin(i/count*6.28)*size*3,dy:2+i%3});
    }
  }
  function beam(event){
    const from=new T.Vector3(event.from.x,event.from.y,event.from.z),to=new T.Vector3(event.to.x,event.to.y,event.to.z);
    const m=new T.Mesh(new T.CylinderGeometry(.045+event.power*.07,.045+event.power*.07,from.distanceTo(to),8),new T.MeshBasicMaterial({color:0x96f9ff,transparent:true,opacity:1}));
    m.position.copy(from).add(to).multiplyScalar(.5);m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),to.sub(from).normalize());scene.add(m);
    effects.push({m,age:0,life:.24,beam:true,dx:0,dz:0,dy:0});
  }
  function notify(message){$('event-notice').textContent=message;noticeTime=3;}
  function eventsReceived(events){
    for(const e of events){
      if(e.type==='shot'){const view=views.get(e.id);if(view)view.recoil=1;puff(e,.5,3);const me=session.current().entities.find(p=>p.id===playerId);sound(C.WEAPONS[e.weaponType].sound==='energy',e.id===playerId?1:Math.max(.05,1-Math.hypot(e.x-me.x,e.z-me.z)/70)*.5);}
      if(e.type==='beam')beam(e);
      if(e.type==='impact'){puff(e,.7,5);if(e.owner===playerId&&e.targetId){hitTime=.22;notify('命中 '+e.targetId);}}
      if(e.type==='damage'&&e.id===playerId){damageTime=.6;attackerId=e.owner;notify('受到攻击 −'+e.amount+' · 寻找掩体');sound(false,.5);}
      if(e.type==='damage'&&e.owner===playerId){hitTime=.4;notify('命中 '+e.id+' · −'+e.amount);}
      if(e.type==='respawn'&&e.id===playerId){clearInput();deathShown=false;observing=false;updateChaseCamera(session.current().entities.find(p=>p.id===playerId),0,true);notify('已复活 · 保护 2 秒，开炮解除');}
      if(e.type==='pickup'&&e.id===playerId){notify(e.kind==='repair'?'维修补给 · 恢复 45 装甲':'加速补给 · 6 秒内极速 +35%');sound(true,.4);}
      if(e.type==='destroy'){puff(e,2.3,12);notify(e.id===playerId?'你已被击毁':e.owner+' 击毁 '+e.id);}
      if(e.type==='rampEnter'&&e.id===playerId)notify('驶入斜坡 · 可停车、倒车和交战');
      if(e.type==='rampExit'&&e.id===playerId)notify('已驶出斜坡 · '+(e.floor+1)+' 楼');
    }
  }
  const pointer=new T.Vector2(),ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0),-2.2),aimWorld=new T.Vector3();
  const look=new T.Vector3(0,1,52),projected=new T.Vector3(),map=$('battle-map'),mc=map.getContext('2d');
  let mouseKnown=false,mouseFire=false,keys=new Set(),touch=new Map(),zoom=12,activeAim=null,viewYaw=null,viewPitch=.2,lastPointer=null,cameraHeading=0,cameraElevation=.2;
  const status=()=>session.online&&session.suspended?'paused':session.current().status;
  function clearInput(){lastPointer=null;keys.clear();touch.clear();mouseFire=false;document.querySelectorAll('.held').forEach(b=>b.classList.remove('held'));}
  function updatePointer(e){
    const body=session.current().entities.find(e=>e.id===playerId);
    if(!body.alive){lastPointer=null;return;}
    const locked=document.pointerLockElement===canvas;
    const dx=locked?(e.movementX||0):lastPointer?e.clientX-lastPointer.x:0;
    const dy=locked?(e.movementY||0):lastPointer?e.clientY-lastPointer.y:0;
    if(dx||dy){
      viewYaw=C.wrap((viewYaw??body.heading)-dx*.004);
      viewPitch=Math.max(-.12,Math.min(.8,viewPitch+dy*.003));
    }
    lastPointer={x:e.clientX,y:e.clientY};pointer.set(0,0);mouseKnown=true;
    $('aim-reticle').style.left='50%';$('aim-reticle').style.top='50%';
  }
  function lockMouse(){
    if(document.pointerLockElement===canvas)return;
    if(!canvas.requestPointerLock){notify('浏览器不支持鼠标锁定，可拖动视角');return;}
    try{canvas.requestPointerLock()?.catch(()=>notify('请点击战场启用鼠标锁定'));}catch{notify('请点击战场启用鼠标锁定');}
  }
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&status()==='playing')updatePointer(e);});
  document.addEventListener('pointerlockchange',()=>{
    lastPointer=null;
    if(document.pointerLockElement===canvas){mouseKnown=true;pointer.set(0,0);$('aim-reticle').style.left='50%';$('aim-reticle').style.top='50%';}
    else if(status()==='playing'&&$('game-overlay').hidden)pause();
  });
  document.addEventListener('pointerlockerror',()=>notify('鼠标锁定失败，请点击战场重试'));
  canvas.addEventListener('pointermove',e=>{if(status()==='playing'&&document.pointerLockElement!==canvas)updatePointer(e);});
  canvas.addEventListener('pointerleave',()=>{lastPointer=null;});
  canvas.addEventListener('pointerdown',e=>{
    if(status()!=='playing')return;e.preventDefault();canvas.focus({preventScroll:true});
    if(e.pointerType!=='touch'&&document.pointerLockElement!==canvas&&canvas.requestPointerLock){lockMouse();return;}
    updatePointer(e);if(document.pointerLockElement!==canvas)canvas.setPointerCapture(e.pointerId);
    if(e.pointerType!=='touch'&&e.button===0){mouseFire=true;if(session.online)session.input(command(session.current().entities.find(e=>e.id===playerId)),true);}
  });
  for(const name of ['pointerup','pointercancel','lostpointercapture'])canvas.addEventListener(name,()=>{mouseFire=false;if(session.online)session.input(command(session.current().entities.find(e=>e.id===playerId)),true);});
  canvas.addEventListener('contextmenu',e=>e.preventDefault());
  canvas.addEventListener('wheel',e=>{if(status()!=='playing')return;e.preventDefault();zoom=Math.max(8,Math.min(18,zoom+e.deltaY*.01));},{passive:false});
  const bindings={KeyW:'forward',ArrowUp:'forward',KeyS:'reverse',ArrowDown:'reverse',KeyA:'left',ArrowLeft:'left',KeyD:'right',ArrowRight:'right',Space:'brake',KeyF:'fire'};
  window.addEventListener('keydown',e=>{
    if((e.code==='Escape'||e.code==='KeyP')&&!e.repeat){e.preventDefault();if(status()==='playing')pause();else if(status()==='paused'&&e.code==='KeyP'){resume();if(!window.matchMedia('(pointer: coarse)').matches)lockMouse();}return;}
    if(status()!=='playing'||document.activeElement!==canvas||!bindings[e.code])return;
    e.preventDefault();keys.add(e.code);if(session.online&&!e.repeat)session.input(command(session.current().entities.find(e=>e.id===playerId)),true);
  });
  window.addEventListener('keyup',e=>{keys.delete(e.code);if(session.online&&bindings[e.code])session.input(command(session.current().entities.find(e=>e.id===playerId)),true);});
  window.addEventListener('blur',()=>{if(status()==='playing')pause();else clearInput();});
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&status()==='playing')pause();});
  for(const b of [...document.querySelectorAll('[data-action]'),$('fire-button')]){
    b.addEventListener('pointerdown',e=>{
      if(status()!=='playing')return;e.preventDefault();b.setPointerCapture(e.pointerId);
      touch.set(e.pointerId,b.dataset.action||'fire');b.classList.add('held');if(session.online)session.input(command(session.current().entities.find(e=>e.id===playerId)),true);
    });
    const release=e=>{touch.delete(e.pointerId);b.classList.remove('held');if(session.online)session.input(command(session.current().entities.find(e=>e.id===playerId)),true);};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(name,release);
  }
  function command(player){
    const input={fire:mouseFire};for(const key of keys)input[bindings[key]]=true;for(const v of touch.values())input[v]=true;
    if(activeAim){const dx=activeAim.x-player.x,dz=activeAim.z-player.z;input.aimYaw=Math.atan2(dz,-dx);input.aimPitch=Math.max(-.55,Math.min(.55,Math.atan2(activeAim.y-player.y-2.2,Math.hypot(dx,dz))));}
    return input;
  }
  for(const [id,catalog,selected] of [['tank-select',C.TANKS,'medium'],['weapon-select',C.WEAPONS,'standard']]){
    $(id).replaceChildren(...Object.entries(catalog).map(([value,spec])=>{const option=document.createElement('option');option.value=value;option.textContent=spec.name;option.selected=value===selected;return option;}));
  }
  function config(){return {tankType:$('tank-select').value,weaponType:$('weapon-select').value};}
  function updateLoadout(){
    const value=config(),tank=C.TANKS[value.tankType],weapon=C.WEAPONS[value.weaponType];
    $('loadout-summary').textContent=tank.name+' · '+tank.hp+' 装甲 / '+Math.round(tank.speed*3.6)+' km/h；'+weapon.name+' · '+weapon.damage+' 最大伤害'+(weapon.charge?' / 按住蓄力，松开发射':' / '+(weapon.cooldown/60).toFixed(2)+' 秒装填');
  }
  for(const id of ['tank-select','weapon-select'])$(id).addEventListener('change',updateLoadout);
  updateLoadout();
  function clearEffects(){
    $('match-results').hidden=true;
    for(const m of bullets.values())scene.remove(m);bullets.clear();
    for(const e of effects){scene.remove(e.m);e.m.material.dispose();if(e.beam)e.m.geometry.dispose();}effects.length=0;
  }
  function newMatch(){
    if(session.online)return;
    session.restart(config());playerId=session.playerId;snapshot=session.current();createViews();clearEffects();clearInput();
    deathShown=false;observing=false;mouseKnown=false;activeAim=null;hitTime=damageTime=noticeTime=0;$('event-notice').textContent='';
    const p=snapshot.entities.find(e=>e.id===playerId);updateChaseCamera(p,0,true);
  }
  function pause(){if(engineGain)engineGain.gain.value=0;session.pause();clearInput();showMenu('paused');}
  function resume(){
    if(session.start()===false)return;clearInput();$('game-overlay').hidden=true;canvas.focus({preventScroll:true});
    try{if(!audio){const Audio=window.AudioContext||window.webkitAudioContext;if(Audio){audio=new Audio();engine=audio.createOscillator();engineGain=audio.createGain();engine.type='sawtooth';engine.frequency.value=35;engineGain.gain.value=0;engine.connect(engineGain);engineGain.connect(audio.destination);engine.start();}}audio?.resume().catch(()=>{});}catch{}
  }
  function showMenu(kind){
    clearInput();$('game-overlay').hidden=false;if(document.pointerLockElement===canvas)document.exitPointerLock?.();$('aim-reticle').style.display='none';
    $('garage').hidden=kind==='paused'||!!session.online;$('menu-guide').hidden=true;$('restart-button').hidden=false;startButton.hidden=kind==='finished';
    if(kind!=='finished')$('match-results').hidden=true;
    if(kind==='paused'){$('menu-title').textContent='本地暂停';$('menu-description').textContent='本地比赛已暂停，点击继续返回战场。';startButton.textContent='继续战斗 →';$('restart-button').textContent='重新开局 / 当前配置';}
    if(kind==='eliminated'){$('menu-title').textContent='你已出局';$('menu-description').textContent='自由混战仍在继续。可观战剩余坦克，或选择新配置重新开局。';startButton.textContent='继续观战 →';$('restart-button').textContent='用所选配置重新出击 →';}
    if(kind==='finished'){
      const s=session.current(),p=s.entities.find(e=>e.id===playerId);$('menu-title').textContent=s.winnerId===playerId?'本局冠军':'对局结束';
      $('match-results').hidden=false;$('match-results').replaceChildren(...s.entities.slice().sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths||a.id.localeCompare(b.id)).map((e,i)=>{const row=document.createElement('p');row.textContent=(i+1)+'. '+e.id+' · '+e.kills+' 击毁 / '+e.deaths+' 死亡';return row;}));
      $('menu-description').textContent='获胜者：'+(s.winnerId||'平局')+' · 用时 '+Math.floor(s.tick/60)+' 秒 · 你的击毁数 '+p.kills;
      $('restart-button').textContent='用所选配置再战一局 →';
    }
    if(session.online){$('restart-button').hidden=true;$('network-panel').hidden=false;if(kind==='paused'){$('menu-title').textContent='操作已暂停';$('menu-description').textContent='战斗仍在继续，你仍可能被命中。点击继续返回战场。';}if(kind==='eliminated')$('menu-description').textContent='战斗仍在继续，可继续观战，或离开房间。';}
    (startButton.hidden?$('leave-room'):startButton).focus({preventScroll:true});
  }
  startButton.addEventListener('click',()=>{if(status()==='ready')newMatch();if(deathShown)observing=true;resume();if(!window.matchMedia('(pointer: coarse)').matches)lockMouse();});
  $('restart-button').addEventListener('click',()=>{newMatch();resume();if(!window.matchMedia('(pointer: coarse)').matches)lockMouse();});
  $('pause-btn').addEventListener('click',()=>{if(status()==='playing')pause();});
  function drawMap(state,viewer){
    const floor=viewer.floor;mc.fillStyle='#d2ddc0';mc.fillRect(0,0,260,260);mc.save();mc.translate(130,130);mc.scale(1.8,1.8);
    const b=C.MAP.levels[floor].bound;mc.strokeStyle='#718974';mc.lineWidth=1;mc.strokeRect(-b,-b,b*2,b*2);
    mc.fillStyle='#a88e73';for(const o of C.MAP.obstacles)if(o.floor===floor)mc.fillRect(o.x-o.w/2,o.z-o.d/2,o.w,o.d);
    mc.fillStyle='#8ef5d2';for(const s of C.MAP.ramps)for(const p of [s.a,s.b])if(p.floor===floor)mc.fillRect(p.x-2,p.z-2,4,4);
    for(const p of state.pickups)if(p.floor===floor&&p.readyAt<=state.tick){mc.fillStyle=p.kind==='repair'?'#238454':'#c28a27';mc.fillRect(p.x-1.5,p.z-1.5,3,3);}
    for(const e of state.entities){
      if(e.floor!==floor)continue;mc.save();mc.translate(e.x,e.z);mc.rotate(Math.PI-e.heading);mc.fillStyle=e.rampId?'#9bffff':!e.alive?'#484d41':e.id===playerId?'#d7e8ae':'#f68d69';
      mc.beginPath();mc.moveTo(4,0);mc.lineTo(-3,-2.6);mc.lineTo(-2,0);mc.lineTo(-3,2.6);mc.closePath();mc.fill();mc.restore();
    }
    mc.restore();$('map-floor').textContent=(floor+1)+'F / FLOOR';
  }
  // Mouse orbit is independent of the chassis; a centered reticle guides turret aim.
  function updateChaseCamera(body,dt,snap=false){
    if(snap){viewYaw=null;viewPitch=.2;lastPointer=null;cameraHeading=body.heading;cameraElevation=.2;}
    const heading=body.id===playerId?(viewYaw??body.heading):body.heading;
    const distance=zoom*(window.innerWidth<700?1.1:1),ease=snap||reduced?1:1-Math.exp(-dt*8);
    cameraHeading=C.turn(cameraHeading,heading,Math.abs(C.wrap(heading-cameraHeading))*ease);
    cameraElevation+=(viewPitch-cameraElevation)*ease;
    const forward=new T.Vector3(-Math.cos(cameraHeading),0,Math.sin(cameraHeading));
    // A spherical orbit: pitch changes camera height and horizontal radius around one pivot.
    look.lerp(new T.Vector3(body.x,body.y+3.2,body.z),ease);
    const horizontal=distance*Math.cos(cameraElevation);
    camera.position.set(look.x-forward.x*horizontal,look.y+distance*Math.sin(cameraElevation),look.z-forward.z*horizontal);
    // Pull the camera in when a wall lies behind the vehicle, rather than looking through it.
    const anchor={x:body.x,y:body.y+3.2,z:body.z};let fraction=1;
    const floor=body.rampId?C.MAP.ramps.find(r=>r.id===body.rampId).b.floor:body.floor;
    for(const o of C.MAP.obstacles){
      if(o.floor>floor)continue;const y=C.MAP.levels[o.floor].y;
      const hit=C.slabHit(anchor,camera.position,{x:o.x-o.w/2-.4,y:y-.4,z:o.z-o.d/2-.4},{x:o.x+o.w/2+.4,y:y+o.h+.4,z:o.z+o.d/2+.4});
      if(hit!==null)fraction=Math.min(fraction,Math.max(0,hit-.04));
    }
    for(const level of C.MAP.levels){
      if(level.id>floor)continue;
      for(const q of C.deckRects(C.MAP,level)){
        const hit=C.slabHit(anchor,camera.position,{x:q.x0,y:level.y-.8,z:q.z0},{x:q.x1,y:level.y+.2,z:q.z1});
        if(hit!==null)fraction=Math.min(fraction,Math.max(0,hit-.04));
      }
    }
    if(fraction<1)camera.position.set(anchor.x+(camera.position.x-anchor.x)*fraction,anchor.y+(camera.position.y-anchor.y)*fraction,anchor.z+(camera.position.z-anchor.z)*fraction);
    camera.lookAt(look);
  }
  function resize(){renderer.setSize(window.innerWidth,window.innerHeight,false);camera.aspect=window.innerWidth/window.innerHeight;camera.updateProjectionMatrix();}
  window.addEventListener('resize',resize);resize();updateChaseCamera(session.current().entities.find(e=>e.id===playerId),0,true);
  let last=0,hudTime=0;
  function frame(time){
    requestAnimationFrame(frame);const seconds=Math.max(0,(time-last)/1000),dt=Math.min(seconds,.05);last=time;if(document.hidden)return;
    const before=session.current(),localBefore=before.entities.find(e=>e.id===playerId);
    activeAim=null;
    if(mouseKnown){
      ray.setFromCamera(pointer,camera);
      const targetRoots=[...views].filter(([id,v])=>id!==playerId&&v.tank.visible&&before.entities.some(e=>e.id===id&&e.alive)).map(([,v])=>v.tank);
      const hit=ray.intersectObjects([...targetRoots,...floorGroups.filter(g=>g.visible)],true)[0];
      if(hit)activeAim={x:hit.point.x,y:hit.point.y,z:hit.point.z};
      else{plane.constant=-(localBefore.y+2.2);if(!ray.ray.intersectPlane(plane,aimWorld))ray.ray.at(120,aimWorld);activeAim={x:aimWorld.x,y:aimWorld.y,z:aimWorld.z};}
    }
    const events=session.advance(seconds,command(localBefore));eventsReceived(events);
    const state=session.state(),truth=session.current(),p=truth.entities.find(e=>e.id===playerId);
    snapshot=state;
    if(!p.alive&&!deathShown&&truth.status==='playing'){deathShown=true;observing=true;clearInput();}
    if(events.some(e=>e.type==='end'))showMenu('finished');
    const renderPlayer=state.entities.find(e=>e.id===playerId);
    const target=!p.alive&&observing?(state.entities.find(e=>e.id===attackerId&&e.alive)||state.entities.find(e=>e.alive)||renderPlayer):renderPlayer;
    const cameraFloor=target.rampId?C.MAP.ramps.find(r=>r.id===target.rampId).b.floor:target.floor;
    floorGroups.forEach((g,i)=>{g.visible=i<=cameraFloor;});
    if(truth.status==='playing'){
      updateChaseCamera(target,dt);
    }
    camera.lookAt(look);sun.position.set(target.x-25,target.y+52,target.z+20);sun.target.position.set(target.x,target.y,target.z);
    for(const e of state.entities){
      const view=views.get(e.id);view.tank.position.set(e.x,e.y,e.z);const ramp=e.rampId?C.MAP.ramps.find(r=>r.id===e.rampId):null;
      const slope=ramp?(C.MAP.levels[ramp.b.floor].y-C.MAP.levels[ramp.a.floor].y)/(ramp.b.z-ramp.a.z):0;
      view.tank.quaternion.setFromAxisAngle(new T.Vector3(1,0,0),-Math.atan(slope)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),e.heading));
      view.tank.visible=e.floor<=cameraFloor||Boolean(e.rampId);// Cosmetic suspension only; authority coordinates and turret aim stay untouched.
      if(view.lastSpeed===undefined){view.lastSpeed=e.speed;view.lastHeading=e.heading;view.leanPitch=0;view.leanRoll=0;view.travel=0;view.dustTime=0;}
      const response=1-Math.exp(-dt*9),acceleration=Math.max(-18,Math.min(18,(e.speed-view.lastSpeed)/Math.max(dt,.001))),angular=C.wrap(e.heading-view.lastHeading)/Math.max(dt,.001);
      const moving=e.alive&&truth.status==='playing';
      view.leanPitch+=((moving&&!reduced?-acceleration*.002:0)-view.leanPitch)*response;
      view.leanRoll+=((moving&&!reduced?Math.max(-.04,Math.min(.04,angular*e.speed*.002)):0)-view.leanRoll)*response;
      if(moving)view.travel+=Math.abs(e.speed)*dt;
      view.tank.quaternion.multiply(new T.Quaternion().setFromEuler(new T.Euler(view.leanRoll,0,view.leanPitch)));
      if(moving&&!reduced)view.tank.position.y+=Math.sin(view.travel*2.6)*.025*Math.min(1,Math.abs(e.speed)/8);
      view.lastSpeed=e.speed;view.lastHeading=e.heading;view.dustTime+=dt;
      if(moving&&!reduced&&Math.abs(e.speed)>2&&view.dustTime>.14&&effects.length<140){
        view.dustTime=0;const m=new T.Mesh(sphere,new T.MeshBasicMaterial({color:0xe4d5b1,transparent:true,opacity:.25,depthWrite:false}));
        m.position.set(e.x+Math.cos(e.heading)*2.5,e.y+.25,e.z-Math.sin(e.heading)*2.5);m.scale.setScalar(.3);scene.add(m);
        effects.push({m,age:0,life:.65,size:1.1,dx:Math.cos(e.heading)*.4,dz:-Math.sin(e.heading)*.4,dy:.55,opacity:.25});
      }
      view.turret.quaternion.copy(view.tank.quaternion).invert().multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),e.aim));view.gun.rotation.z=-e.pitch;
      view.recoil=Math.max(0,view.recoil-(truth.status==='playing'?dt*5:0));view.gun.position.x=-1.12+view.recoil*.28;
      if(!e.alive&&!view.dead){view.dead=true;view.tank.traverse(o=>{if(o.isMesh&&o!==view.shield)o.material=view.wreck;});}
      if(e.alive&&view.dead){view.dead=false;for(const [mesh,material] of view.originals)mesh.material=material;}
      view.shield.visible=e.alive&&e.protectedUntil>truth.tick;
      view.glow.emissiveIntensity=1+(e.charge/(C.WEAPONS[e.weaponType].charge||1))*5;
      if(truth.status==='playing')for(const w of view.wheels)w.rotateY(e.speed*dt/.43);
      if(view.label){
        projected.set(e.x,e.y+4.6,e.z).project(camera);const shown=e.alive&&view.tank.visible&&projected.z>-1&&projected.z<1&&Math.abs(projected.x)<1.1&&Math.abs(projected.y)<1.1;
        view.label.style.display=shown?'block':'none';view.label.style.left=((projected.x*.5+.5)*window.innerWidth)+'px';view.label.style.top=((-projected.y*.5+.5)*window.innerHeight)+'px';view.bar.style.width=(e.hp/e.maxHp*100)+'%';
      }
    }
    const liveIds=new Set(state.bullets.map(b=>b.id));
    for(const [id,m] of bullets)if(!liveIds.has(id)){scene.remove(m);bullets.delete(id);}
    for(const b of state.bullets){
      let m=bullets.get(b.id);if(!m){m=new T.Mesh(sphere,shellMat);m.scale.set(.15,.15,.7);scene.add(m);bullets.set(b.id,m);}
      m.position.set(b.x,b.y,b.z);m.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),new T.Vector3(b.dx,b.dy,b.dz).normalize());
    }
    if(!reduced){clouds.rotation.y=time*.000004;foliage.rotation.z=Math.sin(time*.0004)*.0015;}
    if(truth.status!=='paused'){
      for(let i=effects.length-1;i>=0;i--){
        const e=effects[i];e.age+=dt;if(e.age>=e.life){scene.remove(e.m);e.m.material.dispose();if(e.beam)e.m.geometry.dispose();effects.splice(i,1);continue;}
        e.m.position.x+=e.dx*dt;e.m.position.z+=e.dz*dt;e.m.position.y+=e.dy*dt;e.m.material.opacity=(e.opacity??1)*(1-e.age/e.life);if(!e.beam)e.m.scale.setScalar(e.size*(.25+e.age));
      }
      hitTime=Math.max(0,hitTime-dt);damageTime=Math.max(0,damageTime-dt);noticeTime=Math.max(0,noticeTime-dt);
    }
    $('hit-marker').style.opacity=hitTime>0?'1':'0';$('damage-vignette').style.opacity=reduced?'0':String(damageTime*.65);
    $('aim-reticle').style.display=!session.suspended&&mouseKnown&&truth.status==='playing'&&p.alive?'block':'none';
    if(!noticeTime)$('event-notice').textContent='';
    $('respawn-status').hidden=p.alive||truth.status!=='playing';
    $('respawn-status').textContent='已被击毁 · '+Math.max(0,Math.ceil((p.respawnAt-truth.tick)/60))+' 秒后复活 · 跟随击毁者观战';
    $('boost-status').textContent=p.boostUntil>truth.tick?'极速 +35% · '+Math.ceil((p.boostUntil-truth.tick)/60)+'s':p.protectedUntil>truth.tick?'复活保护 · 开炮解除':'';
    const attacker=truth.entities.find(e=>e.id===attackerId);
    $('damage-direction').style.opacity=damageTime>0&&attacker?'1':'0';
    if(attacker)$('damage-direction').style.transform='translate(-50%,-50%) rotate('+C.wrap(cameraHeading-Math.atan2(attacker.z-p.z,-(attacker.x-p.x)))+'rad)';
    if(engineGain){engineGain.gain.setTargetAtTime(truth.status==='playing'&&!session.suspended&&p.alive ? .009 : 0,audio.currentTime,.1);engine.frequency.setTargetAtTime(32+Math.abs(p.speed)*3,audio.currentTime,.12);}
    truth.pickups.forEach((pickup,i)=>{const view=pickupViews[i];view.visible=pickup.readyAt<=truth.tick;if(!reduced){view.rotation.y=time*.001;view.position.y=C.MAP.levels[pickup.floor].y+1.3+Math.sin(time*.002+i)*.2;}});
    hudTime+=dt;
    if(hudTime>.08){
      hudTime=0;const weapon=C.WEAPONS[p.weaponType],tank=C.TANKS[p.tankType];
      $('hp-number').textContent=p.hp;$('max-hp').textContent=p.maxHp;$('hp-bar').max=p.maxHp;$('hp-bar').value=p.hp;
      $('vehicle-label').textContent=tank.name+' / '+p.id;$('speed').textContent=Math.round(Math.abs(p.speed)*3.6);
      $('enemy-count').textContent=truth.entities.filter(e=>e.id!==playerId&&e.alive).length;
      $('weapon-label').textContent=weapon.name;
      $('reload-label').textContent=p.cooldown?'装填 '+(p.cooldown/60).toFixed(1)+'s':p.charge?'蓄力 '+Math.round(p.charge/weapon.charge*100)+'%':weapon.charge?'按住蓄力':'主炮就绪';
      $('reload-bar').value=p.charge?p.charge/weapon.charge:1-p.cooldown/weapon.cooldown;
      $('weapon-description').textContent=weapon.charge?'蓄满自动发射；也可松开提前发射':'按住连续开火 · 弹药无限';
      const remaining=Math.max(0,Math.ceil((C.RULES.duration-truth.tick)/60));$('battle-clock').textContent=String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0');
      $('scoreboard').replaceChildren(...truth.entities.slice().sort((a,b)=>b.kills-a.kills||a.deaths-b.deaths||a.id.localeCompare(b.id)).map(e=>{const row=document.createElement('div');row.textContent=(e.id===playerId?'▶ ':'')+e.id+' · '+e.kills+' 击毁 / '+e.deaths+' 死亡'+(e.forfeited?' · 离场':'');return row;}));
      $('ramp-status').textContent=p.rampId?'斜坡行驶 · 可停车 / 倒车 / 交战':'直接驾驶上坡 · 无需按键';
      drawMap(state,target);
    }
    renderer.render(scene,camera);
  }
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();session.pause();clearInput();failure('3D 画面已中断，请刷新重新进入。');});
  function resetLocal(){
    network?.close();network=null;session=new window.TankSession.LocalSession({loadout:config()});playerId=session.playerId;snapshot=session.current();createViews();clearEffects();clearInput();
    deathShown=false;observing=false;mouseKnown=false;activeAim=null;
    $('game-overlay').hidden=false;$('network-entry').hidden=false;$('room-lobby').hidden=true;$('garage').hidden=false;$('garage').disabled=false;
    $('menu-title').textContent='Summer Skirmish';$('menu-description').textContent='选择配置，进入本地训练或创建多人房间。';
    startButton.hidden=false;startButton.disabled=false;startButton.textContent='进入本地训练 →';$('restart-button').hidden=true;
    $('create-room').disabled=false;$('join-room').disabled=false;
  }
  function roomChanged(room){
    $('network-entry').hidden=true;$('room-lobby').hidden=false;$('current-room-code').textContent=room.code;
    const me=room.players.find(p=>p.id===network.entityId),host=room.host===me?.id;
    $('room-players').replaceChildren(...room.players.map(p=>{const li=document.createElement('li');li.textContent=p.name+(p.id===room.host?' [房主]':'')+' · '+C.TANKS[p.tankType].name+' / '+C.WEAPONS[p.weaponType].name+' · '+(!p.connected?'断线，等待重连':p.ready?'已准备':'未准备');return li;}));
    $('ready-room').hidden=room.phase!=='lobby';$('ready-room').textContent=me?.ready?'取消准备':'准备';
    $('start-room').hidden=!host||room.phase!=='lobby';$('start-room').disabled=room.players.length<2||room.players.some(p=>!p.connected||!p.ready);
    $('rematch-room').hidden=!host||room.phase!=='finished';$('garage').disabled=room.phase!=='lobby';
    if(room.phase==='lobby'){
      if(session.online)session.pause();$('game-overlay').hidden=false;$('garage').hidden=false;startButton.hidden=true;$('restart-button').hidden=true;
      $('menu-title').textContent='准备大厅';$('menu-description').textContent='分享房间码，所有人准备后由房主开局（2–8 人）。';
      if(me){$('tank-select').value=me.tankType;$('weapon-select').value=me.weaponType;updateLoadout();}
    }
  }
  function connectRoom(action){
    if(!/^https?:$/.test(location.protocol)){$('network-status').textContent='请通过 Docker 服务的网址打开页面后再联机。';return;}
    network?.close();session.pause();clearInput();startButton.hidden=true;
    $('create-room').disabled=true;$('join-room').disabled=true;
    network=new window.TankNetwork.NetworkSession({url:(location.protocol==='https:'?'wss://':'ws://')+location.host+'/ws',
      onRoom:roomChanged,onLeft:resetLocal,
      onStatus:message=>{$('network-status').textContent=message;if(session.online&&session.suspended){clearInput();showMenu('paused');}},
      onError:message=>{$('network-status').textContent=message;$('create-room').disabled=false;$('join-room').disabled=false;},
      onMatch:next=>{
        session=next;playerId=session.playerId;snapshot=session.current();createViews();clearEffects();clearInput();deathShown=false;observing=false;mouseKnown=false;activeAim=null;
        const p=snapshot.entities.find(e=>e.id===playerId);updateChaseCamera(p,0,true);
        startButton.hidden=false;startButton.disabled=false;
        if(snapshot.status==='finished')showMenu('finished');else resume();
      }
    });network.connect(action);
  }
  $('create-room').addEventListener('click',()=>connectRoom({type:'create',name:$('player-name').value,loadout:config()}));
  $('join-room').addEventListener('click',()=>connectRoom({type:'join',code:$('room-code').value.trim().toUpperCase(),name:$('player-name').value,loadout:config()}));
  $('ready-room').addEventListener('click',()=>network?.send({type:'ready',ready:!network.room.players.find(p=>p.id===network.entityId)?.ready}));
  $('start-room').addEventListener('click',()=>network?.send({type:'start'}));
  $('rematch-room').addEventListener('click',()=>network?.send({type:'rematch'}));
  $('leave-room').addEventListener('click',()=>network?.leave());
  for(const id of ['tank-select','weapon-select'])$(id).addEventListener('change',()=>{if(network?.room?.phase==='lobby')network.send({type:'loadout',loadout:config()});});
  try{const saved=JSON.parse(sessionStorage.getItem('tank-room'));if(saved?.code&&saved?.token){$('reconnect-room').hidden=false;$('reconnect-room').addEventListener('click',()=>connectRoom({type:'resume',...saved}));}}catch{}
  startButton.disabled=false;startButton.textContent='进入本地训练 →';requestAnimationFrame(frame);
})();
