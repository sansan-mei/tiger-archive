const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs'),T=require('three'),C=require('../battle-core.js');
function setup(){const window={TankClient:{}};vm.runInNewContext(fs.readFileSync(require.resolve('../client/woodland-style.js'),'utf8'),{window});return window.TankClient.createWoodlandStyle({T,loadTextures:false});}
function shader(material){const s={uniforms:{},vertexShader:T.ShaderLib.standard.vertexShader,fragmentShader:T.ShaderLib.standard.fragmentShader};material.onBeforeCompile(s);return s;}
test('tree opening tracks camera projection, covers the player-to-reticle corridor, and disables without a live target',()=>{
 const style=setup(),camera=new T.PerspectiveCamera(25,1.6,.1,200),p={x:0,y:0,z:0,tankType:'human',alive:true};camera.position.set(0,16,24);camera.lookAt(0,2,0);
 const s=shader(style.foliage);style.updateOcclusion(camera,p,C);
 const expected=new T.Vector3(0,.25,0).project(camera),focus=s.uniforms.folioFocus.value,limits=s.uniforms.folioOcclusion.value;
 assert.ok(Math.abs(focus.x-expected.x)<1e-6&&Math.abs(focus.y-expected.y)<1e-6);
 assert.equal(focus.z,0);assert.equal(focus.w,0);assert.equal(limits.x,1.6);assert.ok(limits.y>=.12&&limits.y<=.45);assert.ok(limits.z>20);
 const prior=focus.clone();p.x=3;style.updateOcclusion(camera,p,C);assert.notEqual(focus.x,prior.x);
 p.alive=false;style.updateOcclusion(camera,p,C);assert.equal(limits.z,-1);
});
test('occluding trunks have separate shaders from scenery; leaf shadow cutouts stay intact',()=>{
 const style=setup(),trunk=new T.MeshStandardMaterial(),prop=new T.MeshStandardMaterial();trunk.name=prop.name='palette';
 style.fadeOccluder(trunk);style.decorate(trunk);style.decorate(prop);
 assert.notEqual(trunk.customProgramCacheKey(),prop.customProgramCacheKey());
 assert.ok(shader(trunk).uniforms.folioFocus);assert.equal(shader(prop).uniforms.folioFocus,undefined);
 const depth={uniforms:{},vertexShader:T.ShaderLib.depth.vertexShader,fragmentShader:T.ShaderLib.depth.fragmentShader};
 style.foliageDepth.onBeforeCompile(depth);assert.equal(depth.uniforms.folioFocus,undefined);assert.equal(style.foliageDepth.alphaTest,.3);
});
