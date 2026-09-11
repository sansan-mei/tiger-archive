/* Reusable warning rings; state drives visibility, never local damage timers. */
(window.TankClient ??= {}).createPveEffects = function({T,scene}) {
  const rings=new Map(), geometry=new T.RingGeometry(.86,1,40);
  const materials={warning:new T.MeshBasicMaterial({color:0xff534c,transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false}),
    fire:new T.MeshBasicMaterial({color:0xffa23a,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false})};
  return { update(state,cameraFloor) {
    const zones=[];
    if(state.mode==='pve' && state.status==='playing') {
      for(const h of state.pve.hazards)zones.push({...h,key:'fire'+h.id,kind:'fire'});
      state.pve.boss.telegraph?.zones.forEach((z,i)=>zones.push({...z,key:'warning'+i,kind:'warning'}));
    }
    const ids=new Set(zones.map(z=>z.key));
    for(const [key,mesh] of rings)if(!ids.has(key)){scene.remove(mesh);rings.delete(key);}
    for(const z of zones) {
      let mesh=rings.get(z.key);
      if(!mesh){mesh=new T.Mesh(geometry,materials[z.kind]);mesh.rotation.x=-Math.PI/2;mesh.userData.aimIgnore=true;scene.add(mesh);rings.set(z.key,mesh);}
      mesh.position.set(z.x,z.y+.08,z.z);mesh.scale.setScalar(z.radius);
      mesh.visible=z.y<=cameraFloor*8+3;
    }
  } };
};
