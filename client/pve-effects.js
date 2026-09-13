/* Reusable warning rings; state drives visibility, never local damage timers. */
(window.TankClient ??= {}).createPveEffects = function({T,scene}) {
  const rings=new Map(), geometry=new T.RingGeometry(.86,1,40),
    lineGeometry=new T.BoxGeometry(4.2,.04,1), orbGeometry=new T.IcosahedronGeometry(.26,1);
  const materials={warning:new T.MeshBasicMaterial({color:0xff534c,transparent:true,opacity:.85,side:T.DoubleSide,depthWrite:false}),
    fire:new T.MeshBasicMaterial({color:0xffa23a,transparent:true,opacity:.6,side:T.DoubleSide,depthWrite:false}),
    coneWarn:new T.MeshBasicMaterial({color:0xffc66a,transparent:true,opacity:.9,side:T.DoubleSide,depthWrite:false}),
    runnerWarn:new T.MeshBasicMaterial({color:0xff654b,transparent:true,opacity:.75,depthWrite:false}),
    throw:new T.MeshBasicMaterial({color:0xffca58,depthWrite:false}),
    stun:new T.MeshBasicMaterial({color:0xc8d7e6,transparent:true,opacity:.7,side:T.DoubleSide,depthWrite:false})};
  return { update(state,cameraFloor) {
    const zones=[];
    if(state.mode==='pve' && state.status==='playing') {
      for(const h of state.pve.hazards)zones.push({...h,key:'fire'+h.id,kind:'fire'});
      state.pve.boss.telegraph?.zones.forEach((z,i)=>zones.push({...z,key:'warning'+i,kind:'warning'}));
      for(const a of state.pve.enemyAttacks||[]) {
        const y=state.entities.find(e=>e.id===a.owner)?.y||0, key='attack'+a.owner+':'+a.phase;
        if(a.kind==='cone'&&a.phase==='warn')zones.push({key,kind:'coneWarn',x:a.tx,y,z:a.tz,radius:1.2});
        if(a.kind==='cone'&&a.phase==='flight')zones.push({key,kind:'throw',x:a.x,y:y+1.5,z:a.z});
        if(a.kind==='runner'&&['warn','dash'].includes(a.phase))zones.push({key,kind:'runnerWarn',x:a.x,y,z:a.z,tx:a.tx,tz:a.tz});
        if(a.kind==='runner'&&a.phase==='stun')zones.push({key,kind:'stun',x:a.x,y,z:a.z,radius:1.1});
      }
    }
    const ids=new Set(zones.map(z=>z.key));
    for(const [key,mesh] of rings)if(!ids.has(key)){scene.remove(mesh);rings.delete(key);}
    for(const z of zones) {
      let mesh=rings.get(z.key);
      if(!mesh){
        mesh=new T.Mesh(z.kind==='runnerWarn'?lineGeometry:z.kind==='throw'?orbGeometry:geometry,materials[z.kind]);
        if(z.kind!=='runnerWarn'&&z.kind!=='throw')mesh.rotation.x=-Math.PI/2;
        mesh.userData.aimIgnore=true;scene.add(mesh);rings.set(z.key,mesh);
      }
      if(z.kind==='runnerWarn') {
        const dx=z.tx-z.x,dz=z.tz-z.z;
        mesh.position.set((z.x+z.tx)/2,z.y+.09,(z.z+z.tz)/2);
        // The dash hits within 2m of the moving zombie, including just beyond either endpoint.
        mesh.scale.set(1,1,Math.hypot(dx,dz)+4.2);mesh.rotation.y=Math.atan2(dx,dz);
      } else {
        mesh.position.set(z.x,z.y+(z.kind==='throw'?0:.08),z.z);
        mesh.scale.setScalar(z.radius||1);
      }
      mesh.visible=z.y<=cameraFloor*8+4;
    }
  } };
};
