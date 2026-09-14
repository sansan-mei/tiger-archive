const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('three');
function setup({mobile=false,capable=true,reduced=false}={}){
 const controls={};for(const id of ['weather-mode','visual-quality'])controls[id]={value:'auto',addEventListener(type,fn){this.change=fn}};
 const window={TankClient:{},innerWidth:mobile?390:1280,matchMedia:q=>({matches:q.includes('reduced')?reduced:mobile}),addEventListener(){}};
 vm.runInNewContext(fs.readFileSync(require.resolve('../client/atmosphere.js'),'utf8'),{window,document:{getElementById:id=>controls[id]}});
 const scene=new T.Scene();scene.background=new T.Color();scene.fog=new T.Fog(0,1,2);
 const camera=new T.PerspectiveCamera(25,1.6,.1,500);camera.position.set(0,25,25);
 const sun=new T.DirectionalLight(),root=new T.Group(),water=new T.Mesh();water.name='folio-water';root.add(water);scene.add(root);
 const refraction=Object.fromEntries(['enabled','color','depth','rain'].map(k=>[k,{value:0}]));refraction.resolution={value:new T.Vector2()};refraction.nearFar={value:new T.Vector2()};
 let target=null;const calls=[],size=new T.Vector2(1280,800),renderer={capabilities:{isWebGL2:capable},extensions:{has:()=>false},shadowMap:{autoUpdate:true},
  getDrawingBufferSize:v=>v.copy(size),getRenderTarget:()=>target,setRenderTarget:rt=>{target=rt},
  render:(s,c)=>calls.push({scene:s,camera:c,target,water:water.visible,refraction:refraction.enabled.value,shadow:renderer.shadowMap.autoUpdate})};
 const api=window.TankClient.createAtmosphere({T,renderer,scene,camera,sun,style:{setWeather(){}},folio:{root,refraction}});
 const render=t=>api.render(t,{x:0,y:0,z:0},new T.Vector3(0,3,0));
 return {render,calls,renderer,controls,refraction,size,sun,scene,water};
}
test('desktop captures opaque depth, refracts water, then applies depth of field and restores renderer state',()=>{
 const s=setup();s.render(0);assert.equal(s.calls.length,3);
 assert.equal(s.calls[0].water,false);assert.equal(s.calls[0].refraction,0);assert.ok(s.calls[0].target.depthTexture);
 assert.equal(s.calls[1].water,true);assert.equal(s.calls[1].refraction,1);assert.equal(s.calls[1].shadow,false);
 assert.equal(s.calls[2].camera.isOrthographicCamera,true);assert.equal(s.calls[2].target,null);
 assert.equal(s.refraction.color.value,s.calls[0].target.texture);assert.equal(s.renderer.shadowMap.autoUpdate,true);assert.equal(s.water.visible,true);
});
test('resize and switching to low release both render targets; mobile and unsupported contexts skip them',()=>{
 const s=setup();s.render(0);let disposed=0;for(const c of s.calls.slice(0,2))c.target.addEventListener('dispose',()=>disposed++);
 s.size.set(3840,2160);s.calls.length=0;s.render(16);assert.equal(disposed,2);assert.equal(s.calls[0].target.width,2560);
 for(const c of s.calls.slice(0,2))c.target.addEventListener('dispose',()=>disposed++);
 s.controls['visual-quality'].value='low';s.controls['visual-quality'].change();s.calls.length=0;s.render(32);
 assert.equal(disposed,4);assert.equal(s.calls.length,1);assert.equal(s.refraction.enabled.value,0);assert.equal(s.refraction.color.value,null);
 for(const options of [{mobile:true},{capable:false}]){const fallback=setup(options);fallback.render(0);assert.equal(fallback.calls.length,1);assert.equal(fallback.calls[0].target,null);}
});
test('rain transitions change light and precipitation; reduced motion suppresses rain and blur',()=>{
 for(const reduced of [false,true]){
  const s=setup({reduced});s.controls['weather-mode'].value='rain';s.controls['weather-mode'].change();
  for(let t=0;t<=6000;t+=100)s.render(t);
  assert.ok(s.sun.intensity<1.1);assert.ok(s.refraction.rain.value>.9);
  assert.equal(s.scene.getObjectByName('weather-rain').visible,!reduced);
  assert.equal(s.calls.at(-1).scene.children[0].material.uniforms.dof.value,reduced?0:1);
 }
});
