// Folio assets remain archived, but are no longer the active game map.
const {test}=require('node:test'),assert=require('node:assert/strict');
const C=require('../battle-core.js'),S=require('../battle-session.js'),T=require('three');
const asset=require('../client/environment/bruno/map.json');
const archivedMap=require('../core/folio-map.js');
const participants=Array.from({length:8},(_,i)=>({id:'p'+i,controller:'human',tankType:'human',weaponType:'pistol',spawn:i}));
test('archived Folio trees retain their matching archived trunk collisions',()=>{
 assert.equal(asset.metadata.generator,'Bruno Simon Folio 2025 map');
 let count=0;
 for(const[kind,refs]of Object.entries(asset.object.userData.treeReferences))for(const[matrixIndex,matrix]of refs.entries()){
  const collider=archivedMap.obstacles.find(o=>o.id===`folio-tree-${kind}-${matrixIndex}`);
  assert.ok(collider);assert.ok(Math.abs(collider.x-matrix[12]*4/3)<.001);assert.ok(Math.abs(collider.z-matrix[14]*4/3)<.001);count++;
 }
 assert.equal(count,70);
 const d=structuredClone(asset);delete d.images;delete d.textures;for(const m of d.materials)delete m.map;
 const kit=new T.ObjectLoader().parse(d);
 for(const name of ['terrain','scenery','benches','fences','lanterns','poleLights'])assert.ok(kit.getObjectByName(name));
 kit.traverse(o=>{if(o.isMesh)assert.ok([...o.geometry.attributes.position.array].every(Number.isFinite));});
});
test('eight restored woodland PvE starts are walkable and have a clear muzzle',()=>{
 for(const weaponType of ['pistol','standard','rapid','rocket']){
  const b=new C.Battle({mode:'pve',participants});b.start();
  for(const p of b.entities.filter(e=>e.tankType==='human')){
   assert.ok(b.valid(p.x,p.z,0,p));assert.equal(p.y,0);
   p.weaponType=weaponType;p.ammo=C.WEAPONS[weaponType].magazineSize||0;assert.ok(b.shoot(p));
   assert.ok(b.bullets.some(shot=>shot.owner===p.id),`${weaponType} / ${p.id} starts clear of cover`);
  }
  S.validateSnapshot(b.snapshot());
 }
});
test('woodland PvP starts remain legal for every chassis and replicate across floors',()=>{
 assert.equal(C.MAP.terrain,undefined);
 assert.equal(C.MAP.levels.length,3);
 assert.equal(C.MAP.ramps.length,4);
 for(const tankType of Object.keys(C.PLAYER_TANKS)){
  const players=C.defaultParticipants().map(p=>({...p,controller:'human',tankType,weaponType:'standard'}));
  const b=new C.Battle({participants:players});b.start();
  for(const p of b.entities){
   assert.ok(b.valid(p.x,p.z,p.floor,p));
   assert.ok(b.shoot(p));assert.ok(b.bullets.some(s=>s.owner===p.id));
  }
  S.validateSnapshot(b.snapshot());
  const authority=new S.Authority({participants:players});
  const replica=new S.Replica();replica.welcome(authority.attach('tank-map-peer',players[0].id));
  assert.equal(replica.receive(authority.statePacket({network:true})).ok,true);
 }
});
