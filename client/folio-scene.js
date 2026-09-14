/* Original Folio 2025 map models and placement (Bruno Simon, MIT).
 * See environment/bruno/LICENSE.txt. The game keeps its own combat/authority. */
(window.TankClient ??= {}).createFolioScene = function ({T,C,style,onError=()=>{}}) {
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
          vec3 earth=mix(vec3(.95,.55,.22),vec3(.14,.48,.48),smoothstep(.05,.45,data.b));
          vec3 grass=vec3(.47,.48,.09);
          vec3 terrain=mix(earth,grass,data.g);
          float paving=texture2D(folioSlabs,folioPosition.xz*.175).r;
          vec3 stone=mix(vec3(.39,.21,.15),vec3(.96,.67,.34),paving);
          diffuseColor.rgb*=mix(terrain,stone,data.r*.9);
        `);
      };
      ground.customProgramCacheKey=()=> 'folio-original-ground-v1';
      const terrain=kit.getObjectByName('terrain');terrain.children[0].material=ground;root.add(terrain);
      terrain.traverse(o=>{if(o.isMesh)o.receiveShadow=true;});
      const water=new T.Mesh(new T.PlaneGeometry(192,192),new T.MeshStandardMaterial({color:0x71c9ca,roughness:.38,metalness:.12}));
      water.rotation.x=-Math.PI/2;water.position.y=-.29;water.name='folio-water';water.userData.aimIgnore=true;root.add(water);
      const combined=new T.Matrix4(),reference=new T.Matrix4();
      for(const [kind,refs]of Object.entries(kit.userData.treeReferences)){
        const visual=kit.getObjectByName(kind+'Trees'),body=visual.children.find(m=>m.name.startsWith('treeBody'));
        const crowns=visual.children.filter(m=>m.name.startsWith('treeLeaves'));
        const trunks=new T.InstancedMesh(body.geometry,body.material,refs.length);
        const leaves=new T.InstancedMesh(style.crown,style.foliage,refs.length*crowns.length);
        trunks.name='folio-'+kind+'-trunks';leaves.name='folio-'+kind+'-leaves';leaves.userData.aimIgnore=true;
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
          if(o.isMesh){o.castShadow=true;o.receiveShadow=true;o.material.roughness=.9;}
        });
        remove.forEach(o=>o.removeFromParent());root.add(group);
      }
      const bushRefs=kit.userData.bushReferences;
      const bushes=new T.InstancedMesh(style.crown,style.foliage,bushRefs.length);
      bushRefs.forEach((m,i)=>{bushes.setMatrixAt(i,reference.fromArray(m));bushes.setColorAt(i,new T.Color(i%3?0xb8b62e:0xffb267));});
      bushes.name='folio-bushes';bushes.userData.aimIgnore=true;bushes.castShadow=bushes.receiveShadow=true;bushes.computeBoundingSphere();root.add(bushes);
      // Grass density comes from the original painted terrain mask.
      const canvas=document.createElement('canvas');canvas.width=terrainTexture.image.width;canvas.height=terrainTexture.image.height;
      const context=canvas.getContext('2d',{willReadFrequently:true});context.drawImage(terrainTexture.image,0,0);
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data;
      let seed=1729;const random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296),matrices=[],object=new T.Object3D();
      for(let i=0;i<16000;i++){
        const x=(random()-.5)*188,z=(random()-.5)*188;
        const u=Math.min(canvas.width-1,Math.floor((x/192+.5)*canvas.width)),v=Math.min(canvas.height-1,Math.floor((.5-z/192)*canvas.height));
        const offset=(v*canvas.width+u)*4;
        if(pixels[offset+1]<100||pixels[offset+2]>35)continue;
        object.position.set(x,0,z);object.rotation.y=random()*Math.PI*2;object.scale.setScalar(.3+random()*.55);object.updateMatrix();matrices.push(object.matrix.clone());
      }
      const grass=new T.InstancedMesh(style.grassGeometry,style.grass,matrices.length);
      matrices.forEach((m,i)=>grass.setMatrixAt(i,m));grass.name='folio-grass';grass.userData.aimIgnore=true;grass.receiveShadow=true;grass.computeBoundingSphere();root.add(grass);
      await style.ready;return true;
    } catch(error){onError(error);return false;} finally{clearTimeout(timer);}
  })();
  return {root,ready};
};
