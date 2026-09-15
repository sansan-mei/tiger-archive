const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),T=require('three');
const window={TankClient:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../client/pve-ui.js'),'utf8'),{window});
test('offscreen zombie indicators respect camera direction, hide onscreen/dead/friendlies and cap clusters',()=>{
 const camera=new T.PerspectiveCamera(65,1.6,.1,300);camera.updateMatrixWorld();
 const zombie=(x,y,z,extra={})=>({tankType:'zombie',alive:true,x,y,z,...extra});
 const compute=entities=>window.TankClient.pveDirections({T,camera,entities,width:1280,height:800});
 assert.deepEqual(Array.from(compute([zombie(0,0,-20),zombie(100,0,-20,{alive:false}),zombie(-100,0,-20,{tankType:'human'})])),[]);
 const right=compute([zombie(100,0,-20)])[0],left=compute([zombie(-100,0,-20)])[0];
 assert.ok(right.x>90);assert.ok(left.x<10);
 assert.ok(compute([zombie(0,100,-20)])[0].y<10);
 assert.ok(compute([zombie(0,-100,-20)])[0].y>90);
 assert.ok(compute([zombie(100,0,20)])[0].x>90,'behind camera must not mirror left/right');
 assert.ok(Number.isFinite(compute([zombie(0,0,20)])[0].y));
 const crowd=compute(Array.from({length:32},(_,i)=>zombie(Math.cos(i)*100,Math.sin(i)*100,-20)));
 assert.ok(crowd.length<=8);assert.equal(crowd.reduce((n,e)=>n+e.count,0),32);
 assert.equal(compute([zombie(100,0,-20),zombie(101,0,-20)])[0].count,2);
});
