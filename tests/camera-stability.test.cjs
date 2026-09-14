const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const T=require('three'),C=require('../battle-core.js');

// Synthetic geometry, but real Three.js camera and core slab/deck collision math.
function setup({reduced=false}={}){
 const window={innerWidth:1280,innerHeight:800,TankClient:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../client/camera.js'),'utf8'),{window});
 const map={obstacles:[],ramps:[],levels:[{id:0,y:0,bound:100}]};
 const camera=new T.PerspectiveCamera(65,1.6,.1,300);
 const rig=window.TankClient.createCameraRig({T,C:{...C,mapForMode:()=>map},camera,reduced,getPlayerId:()=> 'p'});
 const player={id:'p',x:0,y:0,z:0,heading:0,floor:0,rampId:null};
 rig.update(player,0,true);
 const clear=camera.position.clone();
 const wall=(x=12)=>({floor:0,x,z:0,w:2,d:40,h:40});
 return {map,camera,rig,player,clear,wall};
}

test('collision recovery moves outward gradually after cover clears',()=>{
 const {map,camera,rig,player,clear,wall}=setup();
 map.obstacles.push(wall());
 rig.update(player,1/60);
 const blocked=camera.position.clone();
 assert.ok(blocked.x<clear.x);
 map.obstacles=[];
 rig.update(player,1/60);
 assert.ok(camera.position.x>blocked.x,'camera begins recovering');
 assert.ok(camera.position.x<clear.x-1,'camera must not pop to full distance');
 for(let i=0;i<180;i++) rig.update(player,1/60);
 assert.ok(camera.position.distanceTo(clear)<1e-6,'camera settles at the unobstructed orbit');
});


test('collision uses the smoothed orbit pivot rather than raw body corrections',()=>{
 const {map,camera,rig,player,wall}=setup();
 map.obstacles=[wall()];
 rig.update(player,1/60);
 const blocked=camera.position.clone();
 player.z=20;
 rig.update(player,0);
 assert.ok(camera.position.distanceTo(blocked)<1e-12,'a frozen pivot must keep the collision boom still');
 rig.update(player,1/60);
 const anchor=rig.look.clone().add(new T.Vector3(5,0,0));
 const desired=rig.look.clone().add(new T.Vector3(36*Math.cos(.6),36*Math.sin(.6),0));
 const hit=C.slabHit(anchor,desired,{x:10.6,y:-.4,z:-20.4},{x:13.4,y:40.4,z:20.4});
 const expected=anchor.clone().lerp(desired,Math.max(0,hit-.04));
 assert.ok(camera.position.distanceTo(expected)<1e-10,'collision correction must lie on the rendered pivot boom');
});

test('snap discards collision recovery history and recomputes current cover',()=>{
 const {map,camera,rig,player,clear,wall}=setup();
 map.obstacles=[wall()];
 rig.update(player,1/60);
 map.obstacles=[];
 rig.viewYaw=1;
 rig.viewPitch=.1;
 rig.lastPointer={x:1,y:2};
 rig.update(player,0,true);
 assert.ok(camera.position.distanceTo(clear)<1e-12,'snap must not carry a shortened boom into a new life');
 assert.equal(rig.viewYaw,null);
 assert.equal(rig.viewPitch,.6);
 assert.equal(rig.lastPointer,null);
 map.obstacles=[wall()];
 rig.update(player,0,true);
 assert.ok(camera.position.x<10.6,'snap still obeys current collision');
});

test('reduced motion skips recovery animation but zero-dt aim refreshes preserve the boom',()=>{
 const {map,camera,rig,player,clear,wall}=setup({reduced:true});
 map.obstacles=[wall()];
 rig.update(player,0);
 const blocked=camera.position.clone();
 assert.ok(blocked.x<10.6);
 map.obstacles=[];
 for(let i=0;i<5;i++) rig.update(player,0);
 assert.ok(camera.position.distanceTo(blocked)<1e-12,'aim refresh must not advance recovery');
 rig.update(player,1/60);
 assert.ok(camera.position.distanceTo(clear)<1e-12,'reduced motion recovers without animation');
});

test('recovery is frame-rate independent and zero-dt refreshes add no elapsed time',()=>{
 const results=[];
 for(const hz of [30,60,144]){
  const {map,camera,rig,player,wall}=setup();
  map.obstacles=[wall()];rig.update(player,0);map.obstacles=[];
  for(let i=0;i<hz/2;i++){rig.update(player,0);rig.update(player,1/hz);}
  results.push(camera.position.clone());
 }
 for(const result of results) assert.ok(result.distanceTo(results[0])<1e-10);
});

test('new obstructions pull inward immediately even during recovery or zero dt',()=>{
 const {map,camera,rig,player,wall}=setup();
 for(const x of [12,8]){
  map.obstacles=[wall(x)];
  rig.update(player,0);
  assert.ok(camera.position.x<x-1.4,'camera stays in front of padded wall on the first frame');
  map.obstacles=[];
  rig.update(player,1/60);
 }
});
