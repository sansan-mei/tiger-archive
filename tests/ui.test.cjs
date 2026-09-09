const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const {RoomServer}=require('../room-server.js'),C=require('../battle-core.js');
const ROOT=path.resolve(__dirname,'..');
test('page event wiring creates a room, starts, renders snapshots, pauses locally and leaves',()=>{
  const html=fs.readFileSync(path.join(ROOT,'index.html'),'utf8'),nodes=new Map(),windowEvents={};let document,frame,renderedCamera,now=0;
  const ctx2d=new Proxy({},{get:(o,k)=>o[k]??(()=>{}),set:(o,k,v)=>(o[k]=v,true)});
  class Element{
    constructor(id=''){this.id=id;this.listeners={};this.children=[];this.style={};this.dataset={};this.hidden=false;this.disabled=false;this.value='';this.classList={add(){},remove(){}};}
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}emit(k,event={}){for(const fn of this.listeners[k]||[])fn({preventDefault(){},...event});}
    add(...items){this.children.push(...items);}append(...items){this.add(...items);}appendChild(e){this.add(e);}replaceChildren(...items){this.children=items;if(this.id.endsWith('-select'))this.value=items.find(i=>i.selected)?.value||items[0]?.value;}
    remove(){}focus(){document.activeElement=this;}getContext(){return ctx2d;}getBoundingClientRect(){return {left:0,top:0,width:1280,height:800};}setPointerCapture(){}
  }
  for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))nodes.set(id,new Element(id));nodes.get('player-name').value='Tester';
  document={hidden:false,activeElement:null,getElementById:id=>nodes.get(id),createElement:()=>new Element(),querySelectorAll:()=>[],addEventListener(){}};
  class Renderer{constructor(){this.shadowMap={};}setPixelRatio(){}setSize(){}render(scene,camera){renderedCamera=camera;}}
  const rooms=new RoomServer({now:()=>now}),sockets=[];
  class WS{
    constructor(){this.readyState=1;this.bufferedAmount=0;this.listeners={};sockets.push(this);this.id=rooms.connect({bufferedAmount:0,send:data=>this.emit('message',{data}),close:()=>this.close()});}
    addEventListener(k,fn){(this.listeners[k]??=[]).push(fn);}emit(k,e={}){for(const fn of this.listeners[k]||[])fn(e);}send(data){rooms.receive(this.id,data);}close(){this.readyState=3;rooms.disconnect(this.id);this.emit('close');}
  }
  const context=vm.createContext({document,TextEncoder,console,performance:{now:()=>now},setTimeout,clearTimeout,WebSocket:WS,sessionStorage:{setItem(){},removeItem(){},getItem(){return null;}},location:{protocol:'http:',host:'game.test'},requestAnimationFrame:fn=>{frame=fn;},innerWidth:1280,innerHeight:800,devicePixelRatio:1,matchMedia:()=>({matches:true}),addEventListener:(k,fn)=>{(windowEvents[k]??=[]).push(fn);},THREE:{...require('three'),WebGLRenderer:Renderer}});context.window=context;
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
  nodes.get('pause-btn').emit('click');nodes.get('leave-room').emit('click');assert.equal(nodes.get('room-lobby').hidden,true);assert.equal(nodes.get('start-button').hidden,false);
});
