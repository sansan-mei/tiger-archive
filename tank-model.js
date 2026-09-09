/* Lightweight vehicle visuals. Gameplay dimensions come from the shared catalogue. */
window.createTankModel=function(T,{tankType,weaponType,color=0x9d956f}){
  const spec=window.TankBattle.TANKS[tankType],weapon=window.TankBattle.WEAPONS[weaponType];
  const tank=new T.Group(),turret=new T.Group(),gun=new T.Group();
  const paint=new T.MeshStandardMaterial({color,roughness:.8,metalness:.25});
  const edge=new T.MeshStandardMaterial({color:0x566047,roughness:.9});
  const rubber=new T.MeshStandardMaterial({color:0x28352b,roughness:1});
  const glow=new T.MeshStandardMaterial({color:0x67d8e0,emissive:0x176b7e,emissiveIntensity:1.0});
  const geometry=new T.BoxGeometry(1,1,1),wheels=[];
  function block(w,h,d,x,y,z,material=paint,parent=tank){
    const m=new T.Mesh(geometry,material);m.scale.set(w,h,d);m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  function cylinder(r,h,x,y,z,material,parent,axis='y'){
    const m=new T.Mesh(new T.CylinderGeometry(r,r,h,12),material);m.position.set(x,y,z);
    if(axis==='z')m.rotation.x=Math.PI/2;if(axis==='x')m.rotation.z=Math.PI/2;
    m.castShadow=true;m.receiveShadow=true;parent.add(m);return m;
  }
  const ctx={T,block,cylinder,paint,edge,rubber,glow,tank,turret,gun,wheels};
  window.TankPlugins.tanks[tankType].buildVisual(ctx);
  turret.position.set(...spec.mount);tank.add(turret);
  block(2.18,.82,2.02,0,.48,0,paint,turret);
  block(.4,.5,1.68,1.25,.55,0,edge,turret);
  cylinder(.33,.2,.34,1.0,-.47,edge,turret);
  block(.42,.06,.5,-.38,.94,.46,edge,turret);
  gun.position.set(-1.12,.51,0);turret.add(gun);block(.3,.58,1.3,0,0,0,edge,gun);
  window.TankPlugins.weapons[weaponType].buildVisual(ctx);
  tank.scale.setScalar(spec.scale);
  const wreck=new T.MeshStandardMaterial({color:0x343a32,roughness:1});
  const originals=new Map();tank.traverse(o=>{if(o.isMesh)originals.set(o,o.material);});
  const shield=new T.Mesh(new T.SphereGeometry(4.2,16,10),new T.MeshBasicMaterial({color:0x85e8e2,wireframe:true,transparent:true,opacity:.30,depthWrite:false}));
  shield.position.y=1.6;shield.visible=false;tank.add(shield);
  return {tank,turret,gun,wheels,paint,glow,shield,wreck,originals,recoil:0,dead:false,spec,weapon,
    dispose(){
      const geometries=new Set(),materials=new Set();tank.traverse(o=>{if(o.geometry)geometries.add(o.geometry);if(o.material)materials.add(o.material);});
      for(const m of originals.values())materials.add(m);materials.add(wreck);
      for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
    }
  };
};
