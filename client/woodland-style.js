/* Foliage cluster technique and two textures adapted from Bruno Simon's Folio 2025.
 * Copyright (c) 2025 Bruno Simon. MIT: environment/bruno/LICENSE.txt.
 * WebGL materials, terrain layout and placement adapted for this game's combat map. */
(window.TankClient ??= {}).createWoodlandStyle = function ({ T, loadTextures = true }) {
  let seed = 2731;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const solid = (color) => new T.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
  const time = {value:0}, weatherLight={value:new T.Color().setRGB(1.08,1.01,.91)},
    weatherShade={value:new T.Color().setRGB(.52,.47,.68)}, wind={value:.35};
  function setWeather({light,shade,wind:amount}){weatherLight.value.copy(light);weatherShade.value.copy(shade);wind.value=amount;}
  const occlusion = {
    focus:{value:new T.Vector4(0,0,0,0)},
    limits:{value:new T.Vector3(1,.2,-1)}
  };
  const focusPoint=new T.Vector3(),viewPoint=new T.Vector3();
  function updateOcclusion(camera,body,C) {
    occlusion.limits.value.z=-1;
    if(!body?.alive)return;
    camera.updateMatrixWorld();
    viewPoint.set(body.x,body.y+.25,body.z).applyMatrix4(camera.matrixWorldInverse);
    if(viewPoint.z>=-camera.near)return;
    focusPoint.set(body.x,body.y+.25,body.z).project(camera);
    const radius=(C.TANKS[body.tankType].radius+.8)*camera.projectionMatrix.elements[5]/-viewPoint.z;
    // A screen-space corridor joins the character to the central aiming area.
    occlusion.focus.value.set(focusPoint.x,focusPoint.y,0,0);
    occlusion.limits.value.set(camera.aspect,Math.max(.12,Math.min(.45,radius)),-viewPoint.z+.5);
  }
  function fadeOccluder(material) {
    if(material.userData.folioOccluder)return material;
    material.userData.folioOccluder=true;
    const before=material.onBeforeCompile;
    material.onBeforeCompile=shader=>{
      before.call(material,shader);
      shader.uniforms.folioFocus=occlusion.focus;shader.uniforms.folioOcclusion=occlusion.limits;
      shader.vertexShader='varying vec4 folioClip;\n'+shader.vertexShader;
      shader.vertexShader=shader.vertexShader.replace('#include <logdepthbuf_vertex>',
        '#include <logdepthbuf_vertex>\nfolioClip=gl_Position;');
      shader.fragmentShader='varying vec4 folioClip; uniform vec4 folioFocus; uniform vec3 folioOcclusion;\n'+shader.fragmentShader;
      shader.fragmentShader=shader.fragmentShader.replace('#include <alphatest_fragment>',`
        #include <alphatest_fragment>
        if(folioOcclusion.z>0. && vViewPosition.z<folioOcclusion.z){
          vec2 aspect=vec2(folioOcclusion.x,1.);
          vec2 a=folioFocus.xy*aspect,b=folioFocus.zw*aspect;
          vec2 p=folioClip.xy/folioClip.w*aspect,ab=b-a;
          float h=clamp(dot(p-a,ab)/max(dot(ab,ab),.00001),0.,1.);
          float distanceToFocus=length(p-a-ab*h);
          float coverage=smoothstep(folioOcclusion.y*.65,folioOcclusion.y*1.65,distanceToFocus);
          // Dithered cutouts avoid alpha sorting problems across overlapping instanced crowns.
          // The center clears completely; the soft edge restores the canopy gradually.
          float dither=fract(52.9829189*fract(dot(floor(gl_FragCoord.xy),vec2(.06711056,.00583715))));
          if(coverage<=dither)discard;
        }
      `);
    };
    material.customProgramCacheKey=()=> 'folio-occluder-v1-'+material.name;
    return material;
  }
  // WebGL port of Folio's MeshDefaultMaterial: palette colors and tinted shadows.
  function decorate(material) {
    if(material.userData.folioStyled) return material;
    material.userData.folioStyled=true;
    const before = material.onBeforeCompile;
    material.onBeforeCompile = shader => {
      before.call(material, shader);
      shader.uniforms.folioTime = time;
      shader.uniforms.folioLight=weatherLight;shader.uniforms.folioShadeColor=weatherShade;
      shader.fragmentShader='uniform vec3 folioLight; uniform vec3 folioShadeColor;\n'+shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace('#include <shadowmap_pars_fragment>', '#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
      shader.fragmentShader = shader.fragmentShader.replace('#include <opaque_fragment>', `
        vec3 folioNormal = inverseTransformDirection(normal, viewMatrix);
        float coreShade = 1.0-smoothstep(-.25,1.0,dot(folioNormal,normalize(vec3(-25.,52.,20.))));
        float folioShade = max(coreShade,1.0-getShadowMask());
        outgoingLight = mix(diffuseColor.rgb * folioLight,diffuseColor.rgb * folioShadeColor,folioShade*.72) + totalEmissiveRadiance;
        #include <opaque_fragment>
      `);
    };
    material.customProgramCacheKey = () => 'folio-palette-v2-'+material.name+(material.userData.folioOccluder?'-occlusion':'');
    return material;
  }
  const leafFallback = new T.DataTexture(new Uint8Array([255,255,255,255]), 1, 1);
  leafFallback.needsUpdate = true;
  const slabFallback = new T.DataTexture(new Uint8Array([200,200,200,255]), 1, 1);
  slabFallback.needsUpdate = true;
  const foliage = solid(0xffffff);
  foliage.name = 'garden-foliage'; foliage.side = T.DoubleSide;
  foliage.alphaMap = leafFallback; foliage.alphaTest = .3;
  const slab = { value: slabFallback };
  const ready = loadTextures ? Promise.all([
    new T.TextureLoader().loadAsync('client/environment/bruno/foliage.png').then(t => {
      foliage.alphaMap = t; foliage.needsUpdate = true; leafFallback.dispose();
    }).catch(() => {}),
    new T.TextureLoader().loadAsync('client/environment/bruno/slabs.png').then(t => {
      t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 4;
      slab.value = t; slabFallback.dispose();
    }).catch(() => {}),
  ]) : Promise.resolve();

  // Overlapping leaf cards with outward normals make soft, leafy crowns instead
  // of solid polygon blobs. Unlike the reference's fixed camera, cards face all axes.
  const positions = [], normals = [], uvs = [], centers = [], corners = [];
  const point = new T.Vector3(), normal = new T.Vector3();
  for (let i = 0; i < 80; i++) {
    const radius = 1 - Math.pow(random(),3);
    const y = random() * 2 - 1, phi = random() * Math.PI * 2;
    point.set(Math.sqrt(1-y*y)*Math.cos(phi), y, Math.sqrt(1-y*y)*Math.sin(phi)).multiplyScalar(radius);
    const card = new T.PlaneGeometry(.8, .8).toNonIndexed();
    card.rotateZ(random()*Math.PI*2);
    card.translate(point.x,point.y,point.z);
    const p = card.attributes.position;
    for (let j=0;j<p.count;j++) {
      positions.push(p.getX(j),p.getY(j),p.getZ(j));
      centers.push(point.x,point.y,point.z);corners.push(p.getX(j)-point.x,p.getY(j)-point.y);
      normal.set(p.getX(j),p.getY(j)*.7+.35,p.getZ(j)).normalize();
      normals.push(normal.x,normal.y,normal.z);
      uvs.push(card.attributes.uv.getX(j),card.attributes.uv.getY(j));
    }
    card.dispose();
  }
  const crown = new T.BufferGeometry();
  crown.setAttribute('position',new T.Float32BufferAttribute(positions,3));
  crown.setAttribute('normal',new T.Float32BufferAttribute(normals,3));
  crown.setAttribute('uv',new T.Float32BufferAttribute(uvs,2));
  crown.setAttribute('folioCenter',new T.Float32BufferAttribute(centers,3));
  crown.setAttribute('folioCorner',new T.Float32BufferAttribute(corners,2));
  crown.computeBoundingSphere();
  const billboard = shader => {
    shader.uniforms.folioTime=time;shader.uniforms.folioWind=wind;
    shader.vertexShader='attribute vec3 folioCenter; attribute vec2 folioCorner; uniform float folioTime; uniform float folioWind;\n'+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <project_vertex>', `
      mat4 folioMatrix = modelMatrix;
      #ifdef USE_INSTANCING
        folioMatrix = modelMatrix * instanceMatrix;
      #endif
      vec4 folioWorld = folioMatrix * vec4(folioCenter,1.);
      vec4 mvPosition = viewMatrix * folioWorld;
      float folioScale = length(folioMatrix[0].xyz);
      float flutter = sin(folioTime*1.4 + folioWorld.x*.35 + folioWorld.z*.27)*.07*folioWind;
      mvPosition.xy += (folioCorner + vec2(flutter,flutter*.35)) * folioScale;
      gl_Position = projectionMatrix * mvPosition;
    `);
  };
  foliage.onBeforeCompile=billboard; fadeOccluder(foliage); decorate(foliage);
  const foliageDepth = new T.MeshDepthMaterial({depthPacking:T.RGBADepthPacking,side:T.DoubleSide,alphaMap:foliage.alphaMap,alphaTest:.3});
  foliageDepth.onBeforeCompile=billboard;
  foliageDepth.customProgramCacheKey=()=> 'folio-leaf-depth-v2';
  ready.then(()=>{foliageDepth.alphaMap=foliage.alphaMap;foliageDepth.needsUpdate=true;});
  const bark = solid(0x766052); bark.name = 'Bark_Garden';
  const stone = solid(0xb7ada3); stone.name = 'garden-stone';
  const grass = solid(0xb8b62e); grass.name = 'garden-grass';
  const blades = [], bladeColors = [];
  for (let i=0;i<7;i++) {
    const angle = random()*Math.PI*2, x=(random()-.5)*.8,z=(random()-.5)*.8;
    const width=.035+random()*.045, height=.35+random()*.3;
    const dx=Math.cos(angle)*width,dz=Math.sin(angle)*width;
    blades.push(x-dx,0,z-dz,x+dx,0,z+dz,x+dx*.8,height,z+dz*.8);
    bladeColors.push(.88,.9,.75,.88,.9,.75,1,1,1);
  }
  const grassGeometry = new T.BufferGeometry();
  grassGeometry.setAttribute('position',new T.Float32BufferAttribute(blades,3));
  grassGeometry.setAttribute('color',new T.Float32BufferAttribute(bladeColors,3));
  grassGeometry.setAttribute('normal',new T.Float32BufferAttribute(Array.from({length:blades.length},(_,i)=>i%3===1?1:0),3));grass.side=T.DoubleSide;grass.vertexColors=true;
  function restyle(models) {
    for (const name of ['CommonTree_3','CommonTree_5','Pine_5']) {
      const tree = models.get(name);
      // Preserve the existing trunk geometry, removing only its old solid canopy.
      for (const child of [...tree.children]) {
        if (/Bark/.test(child.material?.name)) child.material = bark;
        else { tree.remove(child); child.geometry?.dispose(); }
      }
      const clusters = [[0,.76,0,.24],[-.17,.64,.08,.19],[.16,.69,-.05,.20],[.02,.57,-.15,.18],[.07,.9,.02,.15]];
      for(const [x,y,z,r] of clusters) {
        const leaves = new T.Mesh(crown,foliage);
        leaves.position.set(x,y,z); leaves.scale.set(r,r*.87,r);
        leaves.updateMatrix(); tree.add(leaves);
      }
    }
    for(const name of ['Rock_Medium_1','Rock_Medium_2'])
      models.get(name).traverse(o=>{ if(o.isMesh)o.material=stone; });
    models.get('Grass_Common_Short').clear();
    models.get('Grass_Common_Short').add(new T.Mesh(grassGeometry,grass));
  }
  function treeColor(x,z) {
    const patch = Math.sin(x*.025+z*.018);
    return new T.Color(patch > -.05 ? 0xf49baf : patch < -.65 ? 0xb4c482 : 0xe8b36d);
  }
  const ground = solid(0xffffff); ground.name = 'garden-ground';
  ground.onBeforeCompile = shader => {
    shader.uniforms.gardenSlabs = slab;
    shader.vertexShader = 'varying vec3 gardenWorld;\n'+shader.vertexShader;
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\ngardenWorld = (modelMatrix * vec4(position,1.0)).xyz;');
    shader.fragmentShader = 'varying vec3 gardenWorld;\nuniform sampler2D gardenSlabs;\n'+shader.fragmentShader;
    shader.fragmentShader = shader.fragmentShader.replace('#include <color_fragment>', `
      #include <color_fragment>
      vec2 p = gardenWorld.xz;
      float broad = sin(p.x*.037+p.y*.021)*.5 + sin(p.y*.069-p.x*.029)*.25;
      float detail = sin(p.x*1.2+sin(p.y*.8))*sin(p.y*1.5)*.025;
      vec3 meadow = mix(vec3(.30,.36,.13),vec3(.52,.53,.24),clamp(.5+broad*.4+detail,0.,1.));
      float wobble = sin(p.x*.24+p.y*.18)*.32+sin(p.y*.62)*.14;
      float route = min(abs(p.x)-5.5,abs(p.y)-4.5);
      route = min(route,abs(length(p)-102.)-4.6);
      // The central plaza and worn footpaths share the existing flat walkable surface.
      route = min(route,length(p-vec2(0.,52.))-10.);
      float path = 1.-smoothstep(-.7,1.2,route+wobble);
      float paving = texture2D(gardenSlabs,p*.175).r;
      vec3 clay = mix(vec3(.48,.30,.20),vec3(.83,.60,.34),paving);
      clay *= .95+broad*.09;
      diffuseColor.rgb *= mix(meadow,clay,path);
    `);
  };
  ground.customProgramCacheKey = () => 'garden-ground-v1';

  // Soft contact shadows keep scenery grounded even outside the moving sun map.
  const pixels = new Uint8Array(32*32*4);
  for(let y=0;y<32;y++)for(let x=0;x<32;x++) {
    const i=(y*32+x)*4, r=Math.hypot((x-15.5)/15.5,(y-15.5)/15.5);
    pixels[i]=pixels[i+1]=pixels[i+2]=255;
    pixels[i+3]=Math.round(Math.pow(Math.max(0,1-r),1.6)*115);
  }
  const shadowTexture = new T.DataTexture(pixels,32,32);shadowTexture.needsUpdate=true;
  const contact = new T.MeshBasicMaterial({color:0x4b3c52,map:shadowTexture,transparent:true,depthWrite:false});
  const contactGeometry = new T.PlaneGeometry(1,1);contactGeometry.rotateX(-Math.PI/2);
  function addDetails(C,floorGroups) {
    for(const level of C.MAP.levels) {
      const obstacles=C.MAP.obstacles.filter(o=>o.floor===level.id);
      const shadows=new T.InstancedMesh(contactGeometry,contact,obstacles.length);
      const transform=new T.Object3D();
      obstacles.forEach((o,i)=>{
        transform.position.set(o.x,level.y+.035,o.z);
        transform.scale.set(o.kind==='tree'?10:o.w*1.8,1,o.kind==='tree'?10:o.d*1.8);
        transform.updateMatrix();shadows.setMatrixAt(i,transform.matrix);
      });
      shadows.name='garden-contact-shadows';shadows.userData.aimIgnore=true;
      shadows.computeBoundingSphere();floorGroups[level.id].add(shadows);
    }
  }
  return { updateOcclusion, fadeOccluder, setWeather, decorate, foliageDepth, update: t=>{time.value=t*.001;}, ready, ground, restyle, treeColor, addDetails, crown, foliage, grassGeometry, grass };
};
