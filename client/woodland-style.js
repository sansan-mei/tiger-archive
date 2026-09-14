/* Foliage cluster technique and two textures adapted from Bruno Simon's Folio 2025.
 * Copyright (c) 2025 Bruno Simon. MIT: environment/bruno/LICENSE.txt.
 * WebGL materials, terrain layout and placement adapted for this game's combat map. */
(window.TankClient ??= {}).createWoodlandStyle = function ({ T, loadTextures = true }) {
  let seed = 2731;
  const random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  const solid = (color) => new T.MeshStandardMaterial({ color, roughness: 1, metalness: 0 });
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
  const positions = [], normals = [], uvs = [];
  const point = new T.Vector3(), normal = new T.Vector3();
  for (let i = 0; i < 140; i++) {
    const radius = .35 + .65 * Math.cbrt(random());
    const y = random() * 2 - 1, phi = random() * Math.PI * 2;
    point.set(Math.sqrt(1-y*y)*Math.cos(phi), y, Math.sqrt(1-y*y)*Math.sin(phi)).multiplyScalar(radius);
    const card = new T.PlaneGeometry(1.05 + random()*.25, 1.05 + random()*.25).toNonIndexed();
    card.rotateZ(random()*Math.PI*2); card.rotateY(random()*Math.PI*2); card.rotateX(random()*Math.PI);
    card.translate(point.x,point.y,point.z);
    const p = card.attributes.position;
    for (let j=0;j<p.count;j++) {
      positions.push(p.getX(j),p.getY(j),p.getZ(j));
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
  crown.computeBoundingSphere();
  const bark = solid(0x766052); bark.name = 'Bark_Garden';
  const stone = solid(0xb7ada3); stone.name = 'garden-stone';
  const grass = solid(0xa8af64); grass.name = 'garden-grass';
  const blades = [], bladeColors = [];
  for (let i=0;i<7;i++) {
    const angle = random()*Math.PI*2, x=(random()-.5)*.8,z=(random()-.5)*.8;
    const width=.09+random()*.07, height=.45+random()*.55;
    const dx=Math.cos(angle)*width,dz=Math.sin(angle)*width;
    blades.push(x-dx,0,z-dz,x+dx,0,z+dz,x+dx*.8,height,z+dz*.8);
    bladeColors.push(.65,.70,.45,.65,.70,.45,1,1,.8);
  }
  const grassGeometry = new T.BufferGeometry();
  grassGeometry.setAttribute('position',new T.Float32BufferAttribute(blades,3));
  grassGeometry.setAttribute('color',new T.Float32BufferAttribute(bladeColors,3));
  grassGeometry.computeVertexNormals();grass.side=T.DoubleSide;grass.vertexColors=true;
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
  return { ready, ground, restyle, treeColor, addDetails, crown, foliage, grassGeometry, grass };
};
