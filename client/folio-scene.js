/* Original Folio 2025 map models and placement (Bruno Simon, MIT).
 * See environment/bruno/LICENSE.txt. The game keeps its own combat/authority. */
(window.TankClient ??= {}).createFolioScene = function ({T,C,style,onError=()=>{}}) {
  const refraction={enabled:{value:0},color:{value:null},depth:{value:null},resolution:{value:new T.Vector2(1,1)},nearFar:{value:new T.Vector2(.1,500)},rain:{value:0}};
  const root=new T.Group();root.name='folio-map';root.scale.setScalar(4/3);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),15000);
  const ready=(async()=>{
    try {
      const response=await fetch('client/environment/bruno/map.json',{signal:controller.signal});
      if(!response.ok)throw Error('Original map unavailable');
      const data=await response.json();if(data.metadata?.generator!=='Bruno Simon Folio 2025 map')throw Error('Unexpected original map');
      const kit=await new T.ObjectLoader().parseAsync(data);
      const terrainTexture=await new T.TextureLoader().loadAsync('client/environment/bruno/terrain.png');
      const slabs=await new T.TextureLoader().loadAsync('client/environment/bruno/slabs.png');
      slabs.wrapS=slabs.wrapT=T.RepeatWrapping;slabs.anisotropy=4;
      const ground=new T.MeshStandardMaterial({color:0xffffff,roughness:1});
      ground.onBeforeCompile=shader=>{
        shader.uniforms.folioTerrain={value:terrainTexture};shader.uniforms.folioSlabs={value:slabs};
        shader.vertexShader='varying vec3 folioPosition;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfolioPosition=position;');
        shader.fragmentShader='varying vec3 folioPosition;\nuniform sampler2D folioTerrain;\nuniform sampler2D folioSlabs;\n'+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`
          #include <color_fragment>
          vec3 data=texture2D(folioTerrain,folioPosition.xz/192.+.5).rgb;
          vec3 earth=mix(vec3(1.,.397,.076),vec3(.105,.539,.485),smoothstep(.1,.3,data.b));
          earth=mix(earth,vec3(.0065,.038,.114),smoothstep(.3,.9,data.b));
          vec3 grass=vec3(.479,.468,.027);
          vec3 terrain=mix(earth,grass,data.g);
          float paving=texture2D(folioSlabs,folioPosition.xz*.175).r;
          vec3 stone=mix(vec3(.392,.184,.122),vec3(1.,.624,.258),paving);
          float noise = .5+.2*sin(folioPosition.x*.19+sin(folioPosition.z*.13)*2.)+.2*sin(folioPosition.z*.29+folioPosition.x*.09);
          diffuseColor.rgb*=mix(terrain,stone,data.r*noise);
        `);
      };
      ground.name='folio-ground';style.decorate(ground);
      const terrain=kit.getObjectByName('terrain');terrain.children[0].material=ground;root.add(terrain);
      terrain.traverse(o=>{if(o.isMesh)o.receiveShadow=true;});
      const waterMaterial=new T.MeshBasicMaterial({color:0x5bc2b9,transparent:true,opacity:.82});
      const waterTime={value:0};
      waterMaterial.onBeforeCompile=shader=>{
        shader.uniforms.folioWaterTime=waterTime;shader.uniforms.folioTerrain={value:terrainTexture};
        for(const [key,uniform]of Object.entries(refraction))shader.uniforms['water_'+key]=uniform;
        shader.vertexShader='varying vec2 waterUv;\n'+shader.vertexShader;
        shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwaterUv=uv;');
        shader.fragmentShader=`varying vec2 waterUv; uniform float folioWaterTime; uniform sampler2D folioTerrain;
          uniform float water_enabled;uniform sampler2D water_color;uniform sampler2D water_depth;
          uniform vec2 water_resolution;uniform vec2 water_nearFar;uniform float water_rain;
          float waterDistance(float d){return water_nearFar.x*water_nearFar.y/(water_nearFar.y-d*(water_nearFar.y-water_nearFar.x));}
        `+shader.fragmentShader;
        shader.fragmentShader=shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
          float depth=texture2D(folioTerrain,waterUv).b;
          float wave=sin(depth*95.-folioWaterTime*1.5+sin(waterUv.x*125.)*.6);
          float foam=smoothstep(.89,.99,wave)*(1.-smoothstep(.2,.65,depth));
          diffuseColor.rgb=mix(vec3(.08,.44,.42),vec3(.4,.75,.68),1.-smoothstep(.3,.9,depth));
          diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.87,.96,.83),foam*.65);
          if(water_enabled>.5){
            vec2 screen=gl_FragCoord.xy/water_resolution;
            float surface=waterDistance(gl_FragCoord.z);
            float behind=waterDistance(texture2D(water_depth,screen).r);
            float thickness=max(0.,behind-surface);
            vec2 waveOffset=vec2(sin(waterUv.y*180.+folioWaterTime*1.3),cos(waterUv.x*170.-folioWaterTime))* (2.+water_rain*3.)/water_resolution;
            vec2 refracted=clamp(screen+waveOffset*min(thickness,2.),vec2(.001),vec2(.999));
            // Do not refract foreground banks/characters into the water.
            if(waterDistance(texture2D(water_depth,refracted).r)<surface+.02)refracted=screen;
            vec3 bed=texture2D(water_color,refracted).rgb;
            float absorption=1.-exp(-thickness*.45);
            diffuseColor.rgb=mix(bed,diffuseColor.rgb,mix(.2,.88,absorption));
            diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.87,.96,.83),foam*.3);
            diffuseColor.a=1.;
          }
          diffuseColor.rgb*=1.-water_rain*.18;
        `);
      };
      const water=new T.Mesh(new T.PlaneGeometry(192,192),waterMaterial);
      water.onBeforeRender=()=>{waterTime.value=performance.now()*.001;};
      water.rotation.x=-Math.PI/2;water.position.y=-.29;water.name='folio-water';water.userData.aimIgnore=true;root.add(water);
      const combined=new T.Matrix4(),reference=new T.Matrix4();
      for(const [kind,refs]of Object.entries(kit.userData.treeReferences)){
        const visual=kit.getObjectByName(kind+'Trees'),body=visual.children.find(m=>m.name.startsWith('treeBody'));
        const crowns=visual.children.filter(m=>m.name.startsWith('treeLeaves'));
        // Trunk materials must be independent from the palette shared by scenery props.
        body.material=body.material.clone();
        style.fadeOccluder(body.material);style.decorate(body.material);
        const trunks=new T.InstancedMesh(body.geometry,body.material,refs.length);
        const leaves=new T.InstancedMesh(style.crown,style.foliage,refs.length*crowns.length);
        trunks.name='folio-'+kind+'-trunks';leaves.name='folio-'+kind+'-leaves';leaves.userData.aimIgnore=true;leaves.customDepthMaterial=style.foliageDepth;
        const color=new T.Color({oak:0xd8cf3b,birch:0xff903f,cherry:0xff9990}[kind]);
        body.updateMatrix();crowns.forEach(c=>c.updateMatrix());
        refs.forEach((matrix,i)=>{
          reference.fromArray(matrix);trunks.setMatrixAt(i,combined.multiplyMatrices(reference,body.matrix));
          crowns.forEach((c,j)=>{const k=i*crowns.length+j;leaves.setMatrixAt(k,combined.multiplyMatrices(reference,c.matrix));leaves.setColorAt(k,color);});
        });
        for(const mesh of [trunks,leaves]){mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();root.add(mesh);}
      }
      // Remove collider guides, keeping original visible meshes at original transforms.
      for(const kind of ['scenery','benches','fences','lanterns','poleLights']){
        const group=kit.getObjectByName(kind),remove=[];
        group.traverse(o=>{
          if(/^(cuboid|hull|ref)/.test(o.name))remove.push(o);
          if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.material.roughness=.9;if(!o.material.userData.folio){style.decorate(o.material);o.material.userData.folio=true;}}
        });
        remove.forEach(o=>o.removeFromParent());root.add(group);
      }
      const bushRefs=kit.userData.bushReferences;
      const bushes=new T.InstancedMesh(style.crown,style.foliage,bushRefs.length);
      bushRefs.forEach((m,i)=>{bushes.setMatrixAt(i,reference.fromArray(m));bushes.setColorAt(i,new T.Color(i%3?0xb8b62e:0xffb267));});
      bushes.customDepthMaterial=style.foliageDepth;bushes.name='folio-bushes';bushes.userData.aimIgnore=true;bushes.castShadow=bushes.receiveShadow=true;bushes.computeBoundingSphere();root.add(bushes);
      // Grass density comes from the original painted terrain mask.
      const canvas=document.createElement('canvas');canvas.width=terrainTexture.image.width;canvas.height=terrainTexture.image.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(terrainTexture.image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let seed=1729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),matrices=[],object=new T.Object3D();
      for(let i=0;i<65000;i++){
        const x=(random()-.5)*188,z=(random()-.5)*188;
        const u=Math.min(canvas.width-1,Math.floor((x/192+.5)*canvas.width)),v=Math.min(canvas.height-1,Math.floor((.5-z/192)*canvas.height));
        const offset=(v*canvas.width+u)*4;
        if(pixels[offset+1]<100||pixels[offset+2]>35)continue;
        object.position.set(x,0,z);object.rotation.y=random()*Math.PI*2;object.scale.setScalar(.55+random()*.6);object.updateMatrix();matrices.push(object.matrix.clone());
      }
      style.decorate(style.grass);
      // Small patches let Three.js cull grass outside the camera instead of drawing the whole garden.
      const patches=new Map();
      for(const matrix of matrices){const key=Math.floor(matrix.elements[12]/16)+":"+Math.floor(matrix.elements[14]/16);if(!patches.has(key))patches.set(key,[]);patches.get(key).push(matrix);}
      for(const [key,patch] of patches){
        const grass=new T.InstancedMesh(style.grassGeometry,style.grass,patch.length);
        grass.onBeforeRender=()=>style.update(performance.now());
        patch.forEach((m,i)=>grass.setMatrixAt(i,m));grass.name='folio-grass-'+key;grass.userData.aimIgnore=true;grass.receiveShadow=true;grass.computeBoundingSphere();root.add(grass);
      }
      await style.ready;return true;
    } catch(error){onError(error);return false;} finally{clearTimeout(timer);}
  })();
  return {root,ready,refraction};
};
