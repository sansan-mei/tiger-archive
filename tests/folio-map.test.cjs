const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),T=require('three');
const asset=require('../client/environment/bruno/map.json');
const participants=Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol',spawn:i}));
test('original Folio trees keep upstream transforms and agree with server trunk collisions',()=>{
 assert.equal(asset.metadata.generator,'Bruno Simon Folio 2025 map');
 let count=0;
 for(const[kind,refs]of Object.entries(asset.object.userData.treeReferences))for(const[matrixIndex,matrix]of refs.entries()){
  const collider=C.PVE_MAP.obstacles.find(o=>o.id===`folio-tree-${kind}-${matrixIndex}`);
  assert.ok(collider);assert.ok(Math.abs(collider.x-matrix[12]*4/3)<.001);assert.ok(Math.abs(collider.z-matrix[14]*4/3)<.001);count++;
 }
 assert.equal(count,70);
 const d=structuredClone(asset);delete d.images;delete d.textures;for(const m of d.materials)delete m.map;
 const kit=new T.ObjectLoader().parse(d);
 for(const name of ['terrain','scenery','benches','fences','lanterns','poleLights'])assert.ok(kit.getObjectByName(name));
 kit.traverse(o=>{if(o.isMesh)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));});
});
test('eight original-map starts are walkable, separated, and have a clear muzzle',()=>{
 for(const weaponType of ['pistol','standard','rapid','rocket']){
  const b=new C.Battle({mode:'pve',participants});b.start();
  for(const p of b.entities.filter(e=>e.tankType==='human')){
   assert.ok(b.valid(p.x,p.z,0,p));assert.equal(p.y,C.groundHeight(b.map,p.x,p.z));
   p.weaponType=weaponType;p.ammo=9;assert.ok(b.shoot(p));
   assert.ok(b.bullets.some(shot=>shot.owner===p.id),`${weaponType} / ${p.id} starts clear of cover`);
  }
 }
});
test('original ponds block walking while bridge heights survive authority replication',()=>{
 const b=new C.Battle({mode:'pve',participants}),p=b.entities[0];
 let water=null,bridge=null;
 for(let x=-120;x<120;x+=2)for(let z=-120;z<120;z+=2){
  const h=C.terrainHeight(b.map,x,z);
  if(h<-.8&&!water)water={x,z};
  if(h>.05&&b.valid(x,z,0,p,{ignoreEntities:true})&&!bridge)bridge={x,z};
 }
 assert.ok(water);assert.equal(b.valid(water.x,water.z,0,p,{ignoreEntities:true}),false);
 assert.ok(bridge,'original bridge has a supported walking surface');
 Object.assign(p,bridge,b.surface(p,bridge.x,bridge.z));
 const snapshot=b.snapshot();S.validateSnapshot(snapshot);
 const restored=new C.Battle({mode:'pve',participants});restored.restore(snapshot);assert.deepEqual(restored.snapshot(),snapshot);
 const authority=new S.Authority({mode:'pve',participants});authority.battle.restore(snapshot);
 const replica=new S.Replica();replica.welcome(authority.attach('map-peer',p.id));
 assert.equal(replica.receive(authority.statePacket({network:true})).ok,true);
 const invalid=b.snapshot();invalid.entities[0].y+=1;assert.throws(()=>S.validateSnapshot(invalid),/floor height/);
});
test('tank battles use the garden with clear, separated starts for every chassis',()=>{
 assert.equal(C.MAP.terrain,C.PVE_MAP.terrain);
 assert.deepEqual(C.MAP.levels,[{id:0,y:0,bound:128}]);
 assert.equal(C.MAP.ramps.length,0);
 for(const tankType of Object.keys(C.PLAYER_TANKS)){
  const players=C.defaultParticipants().map(p=>({...p,controller:'human',tankType,weaponType:'standard'}));
  const b=new C.Battle({participants:players});b.start();
  for(const p of b.entities){
   assert.ok(b.valid(p.x,p.z,0,p));
   assert.ok(b.shoot(p));assert.ok(b.bullets.some(s=>s.owner===p.id));
   for(const other of b.entities)if(other!==p)assert.ok(Math.hypot(p.x-other.x,p.z-other.z)>50);
  }
  S.validateSnapshot(b.snapshot());
  const authority=new S.Authority({participants:players});
  const replica=new S.Replica();replica.welcome(authority.attach('tank-map-peer',players[0].id));
  assert.equal(replica.receive(authority.statePacket({network:true})).ok,true);
 }
});
