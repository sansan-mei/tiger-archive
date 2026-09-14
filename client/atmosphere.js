/* Desktop WebGL adaptation of Folio Weather / Rendering. MIT attribution in environment/bruno. */
(window.TankClient ??= {}).createAtmosphere = function ({T,renderer,scene,camera,sun,style,folio}) {
  const capable = !!renderer.setRenderTarget && !!renderer.getDrawingBufferSize &&
    (renderer.capabilities?.isWebGL2 || renderer.extensions?.has('WEBGL_depth_texture'));
  const desktop = () => window.innerWidth > 700 && !window.matchMedia?.('(pointer: coarse)').matches;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const weatherSelect = document.getElementById('weather-mode'), qualitySelect = document.getElementById('visual-quality');
  let weatherMode='auto', quality='auto', previous=null, cloud=0, rain=0, dusk=0, elapsed=0;
  weatherSelect?.addEventListener('change',()=>{weatherMode=weatherSelect.value;});
  qualitySelect?.addEventListener('change',()=>{quality=qualitySelect.value;});
  const clearSky=new T.Color('#ffc982'), cloudSky=new T.Color('#a6b9c1'), eveningSky=new T.Color('#e0a098');
  const light=new T.Color(), shade=new T.Color();
  const rainGeometry=new T.BufferGeometry(),rainPositions=[],rainEnds=[];
  let seed=117;
  const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
  for(let i=0;i<900;i++){
    const x=(random()-.5)*72,y=random()*36,z=(random()-.5)*72;
    rainPositions.push(x,y,z,x,y,z);rainEnds.push(0,1);
  }
  rainGeometry.setAttribute('position',new T.Float32BufferAttribute(rainPositions,3));
  rainGeometry.setAttribute('rainEnd',new T.Float32BufferAttribute(rainEnds,1));
  const rainUniforms={time:{value:0},strength:{value:0}};
  const rainMaterial=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:rainUniforms,
    vertexShader:`uniform float time; attribute float rainEnd; varying float fade;
      void main(){vec3 p=position; p.y=mod(p.y-time*18.,36.)+rainEnd*.9; p.x+=sin(time*.3)*p.y*.16-rainEnd*.17; p.z+=rainEnd*.08;
      fade=smoothstep(0.,3.,p.y)*(1.-smoothstep(27.,36.,p.y));
      gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
    fragmentShader:`uniform float strength;varying float fade;void main(){gl_FragColor=vec4(.58,.74,.85,fade*strength*.38);
      #include <colorspace_fragment>
    }`});
  const drops=new T.LineSegments(rainGeometry,rainMaterial);drops.name='weather-rain';drops.frustumCulled=false;drops.userData.aimIgnore=true;scene.add(drops);
  let opaque=null,full=null,post=null,postCamera=null,postMaterial=null,size=new T.Vector2();
  function disposeTargets(){
    opaque?.dispose();full?.dispose();opaque=full=null;
    folio.refraction.color.value=folio.refraction.depth.value=null;
    if(postMaterial){postMaterial.uniforms.colorMap.value=null;postMaterial.uniforms.depthMap.value=null;}
  }
  function targets(width,height){
    if(opaque?.width===width&&opaque?.height===height)return;
    disposeTargets();
    const make=()=>{const rt=new T.WebGLRenderTarget(width,height,{minFilter:T.LinearFilter,magFilter:T.LinearFilter,type:renderer.extensions?.has('EXT_color_buffer_float')?T.HalfFloatType:T.UnsignedByteType});rt.depthTexture=new T.DepthTexture(width,height,T.UnsignedIntType);return rt;};
    opaque=make();full=make();
    if(!post){
      post=new T.Scene();postCamera=new T.OrthographicCamera(-1,1,1,-1,0,1);
      postMaterial=new T.ShaderMaterial({depthTest:false,depthWrite:false,uniforms:{
        colorMap:{value:null},depthMap:{value:null},pixel:{value:new T.Vector2()},nearFar:{value:new T.Vector2()},focus:{value:36},dof:{value:1}
      },vertexShader:'varying vec2 texUv;void main(){texUv=uv;gl_Position=vec4(position.xy,0.,1.);}',fragmentShader:`
        varying vec2 texUv;uniform sampler2D colorMap;uniform sampler2D depthMap;
        uniform vec2 pixel;uniform vec2 nearFar;uniform float focus;uniform float dof;
        float distanceAt(vec2 uv){float d=texture2D(depthMap,uv).x;return nearFar.x*nearFar.y/(nearFar.y-d*(nearFar.y-nearFar.x));}
        void main(){
          float depth=distanceAt(texUv);
          // A broad sharp band keeps the player, threats and reticle readable.
          float coc=clamp((abs(depth-focus)-10.)/32.,0.,1.)*dof;
          vec3 base=texture2D(colorMap,texUv).rgb,sum=base;float weight=1.;vec3 glow=max(base-vec3(1.),vec3(0.));
          for(int i=0;i<12;i++){
            float angle=float(i)*2.39996323;
            vec2 offset=vec2(cos(angle),sin(angle))*sqrt((float(i)+.5)/12.)*pixel*4.5*coc;
            vec2 at=clamp(texUv+offset,vec2(0.),vec2(1.));
            // Reject foreground samples to avoid halos on silhouettes and pond banks.
            float w=step(depth-5.,distanceAt(at));
            vec3 c=texture2D(colorMap,at).rgb;sum+=c*w;weight+=w;glow+=max(c-vec3(1.),vec3(0.))*w;
          }
          gl_FragColor=vec4(sum/weight+glow/weight*.25,1.);
          #include <colorspace_fragment>
        }`});
      const quad=new T.Mesh(new T.PlaneGeometry(2,2),postMaterial);quad.frustumCulled=false;post.add(quad);
    }
    postMaterial.uniforms.colorMap.value=full.texture;postMaterial.uniforms.depthMap.value=full.depthTexture;
    postMaterial.uniforms.pixel.value.set(1/width,1/height);
  }
  function render(time,player,focusPoint){
    const dt=previous===null?0:Math.min(.1,Math.max(0,(time-previous)*.001));previous=time;elapsed+=dt;
    let wantedCloud=0,wantedRain=0,wantedDusk=0;
    if(weatherMode==='auto'){
      const phase=elapsed%240;
      wantedCloud=phase<60?0:phase<110?(phase-60)/50:phase<180?1:(240-phase)/60;
      wantedRain=phase<100?0:phase<130?(phase-100)/30:phase<165?1:Math.max(0,(195-phase)/30);
    } else {wantedCloud=weatherMode==='cloudy'?.85:weatherMode==='rain'?1:0;wantedRain=weatherMode==='rain'?1:0;wantedDusk=weatherMode==='sunset'?1:0;}
    const ease=1-Math.exp(-dt*.6);cloud+=(wantedCloud-cloud)*ease;rain+=(wantedRain-rain)*ease;dusk+=(wantedDusk-dusk)*ease;
    scene.background.copy(clearSky).lerp(cloudSky,cloud).lerp(eveningSky,dusk);scene.fog.color.copy(scene.background);
    scene.fog.near=95-cloud*50;scene.fog.far=230-cloud*95;
    sun.color.set('#ffefcf').lerp(new T.Color('#b9cee0'),cloud).lerp(new T.Color('#ffad7a'),dusk);
    sun.intensity=1.8-cloud*.8-dusk*.35;
    light.setRGB(1.08,1.01,.91).lerp(new T.Color().setRGB(.72,.83,.96),cloud).lerp(new T.Color().setRGB(1.12,.76,.59),dusk);
    shade.setRGB(.52,.47,.68).lerp(new T.Color().setRGB(.43,.51,.63),cloud);
    style.setWeather({light,shade,wind:.35+cloud*.9,rain});
    const enhanced=capable && (quality==='high'||(quality==='auto'&&desktop()));
    drops.visible=!reduced&&rain>.015;drops.position.set(player.x,player.y,player.z);
    rainGeometry.setDrawRange(0,enhanced?1800:500);rainUniforms.time.value=elapsed;rainUniforms.strength.value=rain;
    const water=folio.root.getObjectByName('folio-water');
    folio.refraction.enabled.value=0;folio.refraction.rain.value=rain;
    if(!enhanced){if(opaque)disposeTargets();renderer.render(scene,camera);return;}
    renderer.getDrawingBufferSize(size);
    const scale=Math.min(1,2560/size.x,1440/size.y);size.set(Math.max(1,Math.round(size.x*scale)),Math.max(1,Math.round(size.y*scale)));
    targets(size.x,size.y);
    const oldTarget=renderer.getRenderTarget(),oldWater=water?.visible,oldRain=drops.visible,oldShadow=renderer.shadowMap.autoUpdate;
    try{
      if(water)water.visible=false;drops.visible=false;
      renderer.setRenderTarget(opaque);renderer.render(scene,camera);
      if(water)water.visible=oldWater;drops.visible=oldRain;
      const ref=folio.refraction;ref.color.value=opaque.texture;ref.depth.value=opaque.depthTexture;ref.resolution.value.copy(size);ref.nearFar.value.set(camera.near,camera.far);ref.enabled.value=1;
      renderer.shadowMap.autoUpdate=false;
      renderer.setRenderTarget(full);renderer.render(scene,camera);
      const u=postMaterial.uniforms;u.nearFar.value.set(camera.near,camera.far);
      u.focus.value=camera.position.distanceTo(focusPoint);u.dof.value=reduced?0:1;
      renderer.setRenderTarget(oldTarget);renderer.render(post,postCamera);
    }finally{renderer.setRenderTarget(oldTarget);renderer.shadowMap.autoUpdate=oldShadow;if(water)water.visible=oldWater;drops.visible=oldRain;}
  }
  window.addEventListener('pagehide',()=>{disposeTargets();postMaterial?.dispose();post?.children[0]?.geometry.dispose();rainGeometry.dispose();rainMaterial.dispose();});
  return {render};
};
