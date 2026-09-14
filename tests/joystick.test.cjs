const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const C=require('../battle-core.js'),T=require('three');
function setup(tankType='human'){
 const nodes=new Map();
 const node=id=>{if(!nodes.has(id))nodes.set(id,{style:{},dataset:{},classList:{add(){},remove(){}},events:{},addEventListener(k,f){(this.events[k]??=[]).push(f)},setPointerCapture(){},getBoundingClientRect(){return {left:0,top:0,width:128,height:128}},emit(k,e={}){for(const f of this.events[k]||[])f({preventDefault(){},button:0,pointerId:1,...e})}});return nodes.get(id)};
 const document=node('document');document.querySelectorAll=()=>[];
 const window=node('window'),player={id:'p',tankType,heading:0,alive:true},packets=[];
 const session={online:true,current:()=>({status:'playing',entities:[player]}),input:i=>packets.push(i)};
 const context=vm.createContext({window,document,navigator:{platform:'test'}});
 vm.runInContext(fs.readFileSync(require.resolve('../client/input.js'),'utf8'),context);
 const cameraRig={viewYaw:0},input=window.TankClient.createInput({T,C,canvas:node('canvas'),$:node,cameraRig,getSession:()=>session,getPlayerId:()=>player.id,notify(){},pause(){},resume(){}});
 return {input,player,node,cameraRig,packets};
}
test('joystick follows camera-relative full-circle directions and has a center dead zone',()=>{
 const s=setup(),pad=s.node('move-joystick');
 pad.emit('pointerdown',{clientX:64,clientY:64});assert.equal(s.input.command(s.player).brake,true);
 pad.emit('pointermove',{clientX:128,clientY:64});let cmd=s.input.command(s.player);assert.equal(cmd.forward,true);assert.ok(Math.abs(cmd.moveYaw+Math.PI/2)<1e-6);
 s.cameraRig.viewYaw=Math.PI/2;cmd=s.input.command(s.player);assert.ok(Math.abs(cmd.moveYaw)<1e-6);
 pad.emit('pointermove',{clientX:64,clientY:0});assert.equal(s.input.command(s.player).moveYaw,Math.PI/2);
 pad.emit('pointerup');assert.equal(s.packets.at(-1).brake,true);
});
test('joystick owns one finger, keeps simultaneous fire, and resets on cancel, resize and clear',()=>{
 const s=setup(),pad=s.node('move-joystick');
 for(const end of ['pointercancel','lostpointercapture','resize','clear']){
  pad.emit('pointerdown',{clientX:64,clientY:0});
  pad.emit('pointermove',{pointerId:2,clientX:64,clientY:128});assert.equal(s.input.command(s.player).moveYaw,0);
  s.node('fire-button').emit('pointerdown',{pointerId:2});assert.equal(s.input.command(s.player).fire,true);
  if(end==='resize')s.node('window').emit('resize');else if(end==='clear')s.input.clearInput();else pad.emit(end);
  const command=s.input.command(s.player);assert.ok(!command.forward);assert.equal(command.fire,end==='clear'?false:true);
  assert.equal(s.node('joystick-thumb').style.transform,'translate(-50%, -50%)');
  s.node('fire-button').emit('pointerup',{pointerId:2});
 }
});
test('tank joystick steers and reverses without changing authority movement rules',()=>{
 const s=setup('heavy'),pad=s.node('move-joystick');
 pad.emit('pointerdown',{clientX:64,clientY:0});assert.equal(s.input.command(s.player).forward,true);
 pad.emit('pointermove',{clientX:64,clientY:128});assert.equal(s.input.command(s.player).reverse,true);
 pad.emit('pointermove',{clientX:128,clientY:64});assert.equal(s.input.command(s.player).right,true);
 assert.doesNotThrow(()=>C.normalizeInput(s.input.command(s.player)));
});
