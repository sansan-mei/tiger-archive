const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('fs'),vm=require('vm'),T=require('three'),C=require('../battle-core.js');
function setup(platform) {
 const events=()=>({handlers:{},addEventListener(n,f){(this.handlers[n]??=[]).push(f)},emit(n,e={}){e.preventDefault??=()=>{};for(const f of this.handlers[n]||[])f(e)}});
 const window=events(),document=events(),canvas=events(),nodes={};
 document.activeElement=canvas;document.pointerLockElement=canvas;document.querySelectorAll=()=>[];
 const p={id:'p',tankType:'human',alive:true,heading:.1,aim:.4,pitch:.2};
 const cameraRig={viewYaw:.3,viewPitch:.2};
 const ctx=vm.createContext({window,document,navigator:{platform}});
 vm.runInContext(fs.readFileSync('client/input.js','utf8'),ctx);
 const input=window.TankClient.createInput({T,C,canvas,cameraRig,$:id=>(nodes[id]??={...events(),style:{}}),getPlayerId:()=>p.id,
 getSession:()=>({current:()=>({status:'playing',entities:[p]})}),pause:()=>input.clearInput(),notify(){}});
 return {input,p,cameraRig,window,document};
}
for(const [platform,key,other] of [['Win32','AltLeft','MetaLeft'],['MacIntel','MetaLeft','AltLeft']])
 test(`${platform} holds aim and movement while orbiting and restores on release/blur`,()=>{
 const {input,p,cameraRig,window,document}=setup(platform);
 window.emit('keydown',{code:other});assert.equal(input.state.freeLook,false);
 window.emit('keydown',{code:'KeyW'});
 window.emit('keydown',{code:key});assert.equal(input.state.freeLook,true);
 const before=input.command(p);
 document.emit('mousemove',{movementX:100,movementY:50,clientX:0,clientY:0});
 assert.notEqual(cameraRig.viewYaw,.3);
 input.state.activeAim={x:100,y:30,z:100};
 const after=input.command(p);
 assert.equal(after.aimYaw,before.aimYaw);assert.equal(after.aimPitch,before.aimPitch);
 assert.equal(after.moveYaw,.3);assert.equal(after.forward,true);
 window.emit('keyup',{code:key});assert.equal(cameraRig.viewYaw,.3);assert.equal(input.state.freeLook,false);
 assert.equal(input.state.activeAim,null);
 window.emit('keydown',{code:key});window.emit('blur');assert.equal(input.state.freeLook,false);
 });
