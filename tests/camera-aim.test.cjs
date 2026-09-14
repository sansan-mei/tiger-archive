const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),path=require('node:path');
const T=require('three'),C=require('../battle-core.js');
test('local mouse camera yaw and pitch match the requested view on the next frame',()=>{
  const window={innerWidth:1280,TankClient:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../client/camera.js'),'utf8'),{window});
  const camera=new T.PerspectiveCamera(65,1.6,.1,300),
    rig=window.TankClient.createCameraRig({T,C,camera,reduced:false,getPlayerId:()=> 'p0',getMode:()=> 'pve'}),
    player={id:'p0',x:0,y:0,z:55,heading:0,floor:0,rampId:null};
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
