const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const T=require('three'),C=require('../battle-core.js');
const source=fs.readFileSync(require.resolve('../battle.js'),'utf8');
for(const distance of [2,35]) for(const obstacleHeight of [0,18]) test(`PvE pointer projects to muzzle plane: distance ${distance}, obstacle ${obstacleHeight}`,()=>{
 const player={id:'p',tankType:'human',x:0,y:0,z:0,aim:0,alive:true};
 const camera=new T.PerspectiveCamera(65,1.6,.1,300);camera.position.set(25,40,-25);camera.lookAt(0,0,0);camera.updateMatrixWorld();
 const target=new T.Vector3(-distance,C.shotOrigin(player).y,distance/2),ndc=target.clone().project(camera);
 const input={state:{mouseKnown:true,touchAimYaw:null}},ray=new T.Raycaster(),plane=new T.Plane(new T.Vector3(0,1,0)),aimWorld=new T.Vector3();
 let hits=0;
 const context={T,C,input,ray,plane,aimWorld,camera,pointer:new T.Vector2(ndc.x,ndc.y),cameraRig:{isFixedView:()=>true,update(){}},status:()=> 'playing',session:{current:()=>({mode:'pve'})},units:{aimHit(){hits++;return {point:{x:9,y:obstacleHeight,z:2},object:{userData:{}}}}},floorGroups:[]};
 vm.runInNewContext(source.slice(source.indexOf('  function refreshAim(player) {'),source.indexOf('  let last = 0,'))+'\nrefreshAim(player);',{...context,player});
 assert.equal(input.state.activeAim.y,target.y);
 assert.ok(Math.abs(input.state.activeAim.x-target.x)<1e-9);
 assert.ok(Math.abs(input.state.activeAim.z-target.z)<1e-9);
 assert.equal(hits,0,'terrain/obstacles must not choose the PvE aim point');
});
