const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const T=require('three'),C=require('../battle-core.js');
function setup(){
 const window={innerWidth:1280,innerHeight:800,TankClient:{}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../client/camera.js'),'utf8'),{window});
 const map={obstacles:[],ramps:[],levels:[{id:0,y:0,bound:100}]};
 let mode='pve';
 const camera=new T.PerspectiveCamera(65,1.6,.1,300);
 const rig=window.TankClient.createCameraRig({T,C:{...C,mapForMode:()=>map},camera,reduced:false,getPlayerId:()=> 'p',getMode:()=>mode});
 const player={id:'p',x:0,y:0,z:0,heading:0,floor:0,rampId:null};
 rig.update(player,0,true);
 return {camera,rig,player,map,setMode:m=>mode=m};
}
test('PvE fixed diagonal view ignores heading and aim, follows position smoothly, restores PvP orbit',()=>{
 const {camera,rig,player,setMode}=setup(),start=camera.position.clone(),rotation=camera.quaternion.clone();
 assert.equal(rig.cameraHeading,Math.PI/4);
 assert.equal(rig.cameraElevation,.95);
 player.heading=2;rig.viewYaw=-1;rig.viewPitch=.1;rig.update(player,1/60);
 assert.ok(camera.position.distanceTo(start)<1e-10);assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
 player.x=20;rig.update(player,0);assert.ok(camera.position.distanceTo(start)<1e-10);
 rig.update(player,1/60);assert.ok(camera.position.x>start.x && camera.position.x<start.x+20);
 assert.ok(camera.quaternion.angleTo(rotation)<1e-7,'translation cannot rotate view');
 setMode('pvp');rig.update(player,0,true);rig.viewYaw=-1;rig.viewPitch=.4;rig.update(player,1/60);
 assert.equal(rig.cameraHeading,-1);assert.equal(rig.cameraElevation,.4);
});
test('PvE collision shortens without rotating and smoothly recovers after tall cover',()=>{
 const {camera,rig,player,map}=setup(),start=camera.position.clone(),rotation=camera.quaternion.clone();
 map.obstacles=[{floor:0,x:8,z:-8,w:3,d:3,h:40}];rig.update(player,0);
 const blocked=camera.position.clone();assert.ok(blocked.distanceTo(rig.look)<start.distanceTo(rig.look));
 assert.ok(camera.quaternion.angleTo(rotation)<1e-7);
 map.obstacles=[];rig.update(player,0);assert.ok(camera.position.distanceTo(blocked)<1e-10);
 rig.update(player,1/60);assert.ok(camera.position.distanceTo(blocked)>0);assert.ok(camera.position.distanceTo(start)>1);
 for(let i=0;i<180;i++)rig.update(player,1/60);
 assert.ok(camera.position.distanceTo(start)<1e-5);
});
