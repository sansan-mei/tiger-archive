/* Sand trails and rock embankments share the authority's exact sloping surfaces. */
(window.TankClient ??= {}).createRampTerrain = function ({T, C, floorGroups}) {
  const materials = {
    sand: new T.MeshStandardMaterial({color: 0xd5af79}),
    grass: new T.MeshStandardMaterial({color: 0x9ca366}),
    earth: new T.MeshStandardMaterial({color: 0x93837b}),
    stone: new T.MeshStandardMaterial({color: 0xb7ada3}),
  };
  function wedge(parent, name, x0, x1, z0, z1, top, bottom, material) {
    const geometry = new T.BufferGeometry();
    const points = [
      x0,bottom(z0),z0, x1,bottom(z0),z0, x1,bottom(z1),z1, x0,bottom(z1),z1,
      x0,top(z0),z0, x1,top(z0),z0, x1,top(z1),z1, x0,top(z1),z1,
    ];
    geometry.setAttribute('position',new T.Float32BufferAttribute(points,3));
    geometry.setIndex([0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,1,2,6,1,6,5,2,3,7,2,7,6,3,0,4,3,4,7]);
    const index=geometry.index.array;
    for(let i=0;i<index.length;i+=3) [index[i+1],index[i+2]]=[index[i+2],index[i+1]];
    geometry.computeVertexNormals(); material.side=T.DoubleSide;
    const mesh=new T.Mesh(geometry,material);mesh.name=name;
    mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
  }
  for (const r of C.MAP.ramps) {
    const group=new T.Group();group.name='trail-'+r.id;floorGroups[r.a.floor].add(group);
    const x0=r.a.x-r.width/2,x1=r.a.x+r.width/2;
    const z0=Math.min(r.a.z,r.b.z),z1=Math.max(r.a.z,r.b.z);
    const top=z=>C.rampHeight(C.MAP,r,z);
    wedge(group,'trail-shell',x0,x1,z0,z1,top,z=>top(z)-.6,materials.earth);
    // Broad grass shoulders and a subtly irregular sand edge, without height bumps.
    for(let i=0;i<14;i++) {
      const a=z0+(z1-z0)*i/14,b=z0+(z1-z0)*(i+1)/14;
      const left=r.a.x-4.2+Math.sin(i*1.7)*.25,right=r.a.x+4.2+Math.cos(i*1.4)*.25;
      wedge(group,'trail-sand',left,right,a,b,z=>top(z)+.012,top,materials.sand);
      wedge(group,'trail-grass',x0,left,a,b,z=>top(z)+.008,top,materials.grass);
      wedge(group,'trail-grass',right,x1,a,b,z=>top(z)+.008,top,materials.grass);
    }
    // Low stone edges occupy the same narrow collision rails as the original ramp.
    for(const side of [-1,1]) {
      const center=r.a.x+side*(r.width/2-.12);
      wedge(group,'trail-stone-edge',center-.12,center+.12,z0,z1,z=>top(z)+.7,top,materials.stone);
    }
    for(const support of C.rampSupports(C.MAP,r)) {
      const mesh=wedge(group,'trail-embankment',x0,x1,support.z0,support.z1,
        z=>top(z)-.6,()=>C.MAP.levels[r.a.floor].y,materials.earth);
      mesh.userData.rampSupport=true;
      // Horizontal stone courses are flush in the supporting rock face.
      for(let i=0;i<4;i++) {
        const a=support.z0+(support.z1-support.z0)*i/4,b=support.z0+(support.z1-support.z0)*(i+1)/4;
        for(const side of [-1,1]) {
          const edge=side<0?x0:x1;
          wedge(group,'trail-rock-face',edge-.025,edge+.025,a,b,
            z=>top(z)-.61,()=>C.MAP.levels[r.a.floor].y+.01,materials.stone);
        }
      }
    }
    // Flared flat entries visually join the slope to the meadow above and below.
    for(const [point, direction] of [[r.a,Math.sign(r.a.z-r.b.z)],[r.b,Math.sign(r.b.z-r.a.z)]]) {
      const y=C.MAP.levels[point.floor].y;
      const shape=new T.Shape();shape.moveTo(point.x-4.2,point.z);
      shape.lineTo(point.x+4.2,point.z);shape.lineTo(point.x+7,point.z+direction*5);
      shape.lineTo(point.x-7,point.z+direction*5);shape.closePath();
      const geo=new T.ShapeGeometry(shape);geo.rotateX(Math.PI/2);
      const landing=new T.Mesh(geo,materials.sand);landing.position.y=y+.025;
      landing.name='trail-landing';landing.receiveShadow=true;floorGroups[point.floor].add(landing);
    }
    // The patchwork uses four draws per ramp, rather than one draw per soil strip.
    for(const name of ['trail-sand','trail-grass','trail-stone-edge','trail-rock-face']) {
      const meshes=group.children.filter(m=>m.name===name),positions=[],indices=[];
      for(const mesh of meshes) {
        const offset=positions.length/3;
        positions.push(...mesh.geometry.attributes.position.array);
        indices.push(...Array.from(mesh.geometry.index.array,i=>i+offset));
        group.remove(mesh);mesh.geometry.dispose();
      }
      const geometry=new T.BufferGeometry();
      geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));
      geometry.setIndex(indices);geometry.computeVertexNormals();
      const mesh=new T.Mesh(geometry,meshes[0].material);mesh.name=name;
      mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);
    }

  }
};
