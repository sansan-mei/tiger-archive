const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const T=require('three'),C=require('../battle-core.js');
test('local mouse camera yaw and pitch match the requested view on the next frame',()=>{
  const window={innerWidth:1280,TankClient:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/camera.js'),'utf8'),{window});
  const camera=new T.PerspectiveCamera(65,1.6,.1,300),
    rig=window.TankClient.createCameraRig({T,C,camera,reduced:false,getPlayerId:()=> 'p0',getMode:()=> 'pvp'}),
    player={id:'p0',x:0,y:0,z:75,heading:0,floor:0,rampId:null};
  rig.update(player,1/60,true);
  rig.viewYaw=Math.PI/2;
  rig.viewPitch=.55;
  rig.update(player,1/60);
  assert.ok(Math.abs(C.wrap(rig.cameraHeading-rig.viewYaw))<1e-9,'local yaw must not ease toward mouse');
  assert.ok(Math.abs(rig.cameraElevation-rig.viewPitch)<1e-9,'local pitch must not ease toward mouse');
  const forward=new T.Vector3().subVectors(rig.look,camera.position).normalize(),
    expected=new T.Vector3(-Math.cos(rig.viewYaw)*Math.cos(rig.viewPitch),-Math.sin(rig.viewPitch),Math.sin(rig.viewYaw)*Math.cos(rig.viewPitch));
  assert.ok(forward.dot(expected)>.999,'the actual camera ray follows the requested direction');
});
test('phone portrait and landscape center aim starts ahead of the player, with the body below it',()=>{
 for(const [width,height] of [[393,852],[852,393],[320,568]]){
  const window={innerWidth:width,innerHeight:height,TankClient:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/camera.js'),'utf8'),{window});
  const camera=new T.PerspectiveCamera(65,width/height,.1,300),rig=window.TankClient.createCameraRig({T,C,camera,reduced:false,getPlayerId:()=> 'p0',getMode:()=> 'pvp'});
  for(const tankType of ['human','heavy']){
   const spawn=C.PVE_MAP.spawns[0],player={id:'p0',...spawn,y:0,heading:-Math.PI/2,aim:-Math.PI/2,tankType,rampId:null};
   rig.update(player,0,true);camera.updateMatrixWorld();
   const ray=new T.Raycaster();ray.setFromCamera(new T.Vector2(0,0),camera);
   const hit=ray.ray.intersectPlane(new T.Plane(new T.Vector3(0,1,0),-C.shotOrigin(player).y),new T.Vector3());
   assert.ok(hit);assert.ok((hit.z-player.z)*Math.sin(player.heading)>6,'center ray crosses firing height well ahead');
   const body=new T.Vector3(player.x,player.y+1,player.z).project(camera);
   assert.ok(body.y<-.15,'avatar remains below the center reticle');
  }
 }
});
