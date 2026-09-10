const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {RoomServer}=require('../room-server.js'),C=require('../battle-core.js');
const ROOT=path.resolve(__dirname,'..');
test('page event wiring creates a room, starts, renders snapshots, pauses locally and leaves',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),nodes=new Map(),windowEvents={},documentEvents={};let document,frame,renderedCamera,now=0;
  const ctx2d=new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  class Element{
    constructor(id=''){this.id=id;this.listeners={};this.children=[];this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.classList={add(){},remove(){}};}
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}emit(k,event={}){for(const fn of this.listeners[k]||[])fn({preventDefault(){},...event});}
    add(...items){this.children.push(...items);}append(...items){this.add(...items);}appendChild(e){this.add(e);}replaceChildren(...items){this.children=items;if(this.id.endsWith('-select'))this.value=items.find(i=>i.selected)?.value||items[0]?.value;}
    remove(){}focus(){document.activeElement=this;}getContext(){return ctx2d;}getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}setPointerCapture(){}requestPointerLock(){document.pointerLockElement=this;for(const fn of documentEvents.pointerlockchange||[])fn();}
  }
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))nodes.set(id,new Element(id));nodes.get('player-name').value='Tester';
  document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id),createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener:(k,fn)=>{(documentEvents[k]??=[]).push(fn);},exitPointerLock(){this.pointerLockElement=null;for(const fn of documentEvents.pointerlockchange||[])fn();}};
  class Renderer{constructor(){this.shadowMap={};}setPixelRatio(){}setSize(){}render(scene,camera){renderedCamera=camera;}}
  const rooms=new RoomServer({now:()=>now}),sockets=[];
  class WS{
    constructor(){this.readyState=1;this.bufferedAmount=0;this.listeners={};sockets.push(this);this.id=rooms.connect({bufferedAmount:0,send:data=>this.emit('message',{data}),close:()=>this.close()});}
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}emit(k,e={}){for(const fn of this.listeners[k]||[])fn(e);}send(data){rooms.receive(this.id,data);}close(){this.readyState=3;rooms.disconnect(this.id);this.emit('close');}
  }
  const audioValues=[];
  class AudioContext{
    constructor(){this.state='running';this.currentTime=0;this.destination={};}
    resume(){return Promise.resolve();}
    createGain(){return {gain:this.param(),connect(){}};}
    createOscillator(){return {frequency:this.param(),connect(){},start(){},stop(){}};}
    param(){return {value:0,setValueAtTime(v){assert.ok(Number.isFinite(v));audioValues.push(v);},exponentialRampToValueAtTime(v){assert.ok(Number.isFinite(v));},setTargetAtTime(v){assert.ok(Number.isFinite(v));audioValues.push(v);}};}
  }
  const context=vm.createContext({document,TextEncoder,console,AudioContext,performance:{now:()=>now},setTimeout,clearTimeout,WebSocket:WS,sessionStorage:{setItem(){},removeItem(){},getItem(){return null;}},location:{protocol:'http:',host:'game.test'},requestAnimationFrame:fn=>{frame=fn;},innerWidth:1280,innerHeight:800,devicePixelRatio:1,matchMedia:()=>({matches:true}),addEventListener:(k,fn)=>{(windowEvents[k]??=[]).push(fn);},THREE:{...require('three'),WebGLRenderer:Renderer}});context.window=context;
  for(const [,src] of html.matchAll(/<script src="([^"]+)"/g)){if(src==='vendor/three.min.js')continue;vm.runInContext(fs.readFileSync(path.join(ROOT,src),'utf8'),context,{filename:src});}
  nodes.get('create-room').emit('click');sockets[0].emit('open');const room=[...rooms.rooms.values()][0];assert.equal(nodes.get('menu-title').textContent,'准备大厅');
  const second=rooms.connect({bufferedAmount:0,send(){},close(){}});
  rooms.receive(second,JSON.stringify({type:'join',version:C.VERSION,pluginManifest:C.PLUGIN_MANIFEST,code:room.code,name:'Second',loadout:{tankType:'light',weaponType:'rapid'}}));
  nodes.get('ready-room').emit('click');rooms.receive(second,JSON.stringify({type:'ready',ready:true}));nodes.get('start-room').emit('click');
  assert.equal(room.phase,'playing');assert.equal(nodes.get('game-overlay').hidden,true);
  function advance(n=1){for(let i=0;i<n;i++){now+=1000/60;rooms.advance(1/60);frame(now);}}
  advance(3);
  const driver=room.authority.battle.entities[0];
  for(const heading of [0,Math.PI/2,-Math.PI/2,Math.PI-.01]){
    driver.heading=heading;advance(6);
    const forward={x:-Math.cos(heading),z:Math.sin(heading)};
    assert.ok(renderedCamera.position.y-driver.y>4&&renderedCamera.position.y-driver.y<7,'low chase camera height');
    assert.ok((renderedCamera.position.x-driver.x)*forward.x+(renderedCamera.position.z-driver.z)*forward.z < -7,'camera stays behind chassis');
    const gaze=renderedCamera.getWorldDirection(new (require('three').Vector3)());
    assert.ok(gaze.x*forward.x+gaze.z*forward.z>.9,'camera faces the road ahead');
  }
  driver.heading=-Math.PI/2;
  nodes.get('pause-btn').emit('click');assert.equal(nodes.get('menu-title').textContent,'操作已暂停');const tick=room.authority.battle.tick;advance(3);assert.ok(room.authority.battle.tick>tick);
  nodes.get('start-button').emit('click');assert.equal(nodes.get('game-overlay').hidden,true);
  const e=room.authority.battle.entities[0];Object.assign(e,{x:-36,z:30,y:0,floor:0});advance(3);
  for(const fn of windowEvents.keydown)fn({code:'KeyW',preventDefault(){},repeat:false});advance(210);assert.equal(e.floor,1);
  for(const fn of windowEvents.keyup)fn({code:'KeyW',preventDefault(){}});advance(70);
  const aim=e.aim;for(const fn of windowEvents.keydown)fn({code:'KeyQ',preventDefault(){},repeat:false});advance(3);assert.equal(e.aim,aim);
  const oldHeading=e.heading,oldCamera=renderedCamera.position.clone();
  nodes.get('battle-canvas').emit('pointermove',{clientX:600,clientY:400});
  nodes.get('battle-canvas').emit('pointermove',{clientX:800,clientY:320});advance(12);
  assert.equal(e.heading,oldHeading,'mouse does not steer chassis');
  assert.ok(renderedCamera.position.distanceTo(oldCamera)>1,'mouse orbits camera');
  const still=renderedCamera.position.clone();advance(6);
  assert.ok(renderedCamera.position.distanceTo(still)<.001,'stationary mouse does not spin camera');
  // Absolute cursor coordinates stay fixed under pointer lock; deltas must still turn multiple circles.
  Object.assign(e,{x:0,y:0,z:40,floor:0,rampId:null,rampDir:0,speed:0});advance(6);
  const canvas=nodes.get('battle-canvas');canvas.emit('pointerdown',{pointerType:'mouse',button:0,clientX:640,clientY:400});
  assert.equal(document.pointerLockElement,canvas);
  const pivot=new (require('three').Vector3)(e.x,e.y+3.2,e.z);let angle=0,previous=Math.atan2(renderedCamera.position.z-pivot.z,renderedCamera.position.x-pivot.x);
  for(let i=0;i<24;i++){
    for(const fn of documentEvents.mousemove)fn({clientX:640,clientY:400,movementX:80,movementY:0});advance(3);
    const current=Math.atan2(renderedCamera.position.z-pivot.z,renderedCamera.position.x-pivot.x);angle+=C.wrap(current-previous);previous=current;
  }
  assert.ok(Math.abs(angle)>Math.PI*2,'relative mouse input rotates past 360 degrees');
  const oldHeight=renderedCamera.position.y;
  for(const fn of documentEvents.mousemove)fn({clientX:640,clientY:400,movementX:0,movementY:80});advance(6);
  assert.ok(Math.abs(renderedCamera.position.y-oldHeight)>1,'vertical movement changes orbit elevation');
  assert.ok(Math.abs(renderedCamera.position.distanceTo(pivot)-12)<.001,'pitch preserves orbit radius');
  const direction=renderedCamera.getWorldDirection(new (require('three').Vector3)());
  assert.ok(direction.dot(pivot.clone().sub(renderedCamera.position).normalize())>.99999,'pitch keeps the same look-at pivot');
  document.exitPointerLock();assert.equal(nodes.get('game-overlay').hidden,false);assert.equal(nodes.get('menu-title').textContent,'操作已暂停');
  nodes.get('start-button').emit('click');
  now+=1600;frame(now);
  assert.equal(nodes.get('game-overlay').hidden,false,'stale state opens pause UI');
  assert.ok(nodes.get('network-status').textContent.includes('同步超时'));
  nodes.get('start-button').emit('click');assert.equal(nodes.get('game-overlay').hidden,false,'resume is blocked while stale');
  advance(3);assert.ok(nodes.get('network-status').textContent.includes('已恢复'));
  assert.equal(nodes.get('game-overlay').hidden,false,'recovery waits for a click');
  nodes.get('start-button').emit('click');assert.equal(nodes.get('game-overlay').hidden,true);
  for(const fn of windowEvents.keydown)fn({code:'ShiftLeft',preventDefault(){},repeat:false});advance(3);
  assert.equal(e.barrier,60);assert.ok(nodes.get('ability-status').textContent.includes('Shift'));
  for(const fn of windowEvents.keyup)fn({code:'ShiftLeft',preventDefault(){}});
  room.authority.battle.damage(e,10000,room.authority.battle.entities[1].id,e);
  room.authority.history.push(...room.authority.battle.events);advance(6);
  assert.equal(nodes.get('game-overlay').hidden,true,'death does not open blocking menu');
  assert.equal(nodes.get('respawn-status').hidden,false);advance(240);
  assert.equal(e.alive,true);assert.equal(nodes.get('respawn-status').hidden,true);
  assert.equal(nodes.get('scoreboard').children.length,2);assert.ok(audioValues.length>0);
  e.kills=15;advance(6);assert.equal(nodes.get('menu-title').textContent,'本局冠军');
  assert.equal(nodes.get('match-results').hidden,false);assert.equal(nodes.get('match-results').children.length,2);
  nodes.get('leave-room').emit('click');assert.equal(nodes.get('room-lobby').hidden,true);assert.equal(nodes.get('start-button').hidden,false);
  nodes.get('tank-select').value='human';nodes.get('weapon-select').value='rocket';nodes.get('tank-select').emit('change');
  nodes.get('start-button').emit('click');advance(12);assert.equal(Number(nodes.get('hp-number').textContent),80);assert.ok(nodes.get('weapon-label').textContent.includes('火箭'));
  for(const fn of windowEvents.keydown)fn({code:'KeyD',preventDefault(){},repeat:false});advance(20);assert.ok(Number(nodes.get('speed').textContent)>0);
  for(const fn of windowEvents.keyup)fn({code:'KeyD',preventDefault(){}});nodes.get('pause-btn').emit('click');
});
