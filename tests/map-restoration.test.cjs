const {test}=require('node:test');
const assert=require('node:assert/strict');
const C=require('../battle-core.js'), S=require('../battle-session.js');
const manifest=require('../app-manifest.js');

test('restored woodland keeps PvE flat and restores authoritative cover and starts',()=>{
 assert.equal(C.MAP.id,'woodland-crossfire-v5');
 assert.equal(C.PVE_MAP.id,'woodland-crossfire-v5-pve-ground-v1');
 assert.equal(C.PVE_MAP.terrain,undefined);
 assert.equal(C.PVE_MAP.levels.length,1);
 assert.equal(C.PVE_MAP.ramps.length,0);
 assert.equal(C.PVE_MAP.dropExits.length,0);
 assert.equal(C.MAP.levels.length,3);
 assert.equal(C.MAP.ramps.length,4);
 assert.ok(C.PVE_MAP.obstacles.some(o=>o.id==='g1'&&o.x===-17&&o.z===11));
 assert.deepEqual(C.PVE_MAP.spawns[0],{x:0,z:52,floor:0});
 const b=new C.Battle({mode:'pve',participants:[{id:'p0',controller:'human',tankType:'human',weaponType:'pistol',spawn:0}]});
 const body=b.entities[0];
 for(const [x,z] of [[0,52],[0,70],[0,-70],[-100,0],[100,0]])
  assert.ok(b.valid(x,z,0,body),`old road remains passable at ${x},${z}`);
 assert.equal(b.valid(-17,11,0,body),false,'solid visible cover still blocks movement');
 S.validateSnapshot(b.snapshot());
});

test('active scene loads the old nature assets rather than the Folio garden',()=>{
 assert.ok(manifest.scripts.includes('client/environment.js'));
 assert.ok(manifest.scripts.includes('client/ramp-terrain.js'));
 assert.ok(manifest.assets.includes('client/environment/nature-kit.json'));
 for(const path of ['core/folio-map.js','client/folio-scene.js','client/atmosphere.js'])
  assert.ok(!manifest.scripts.includes(path),path);
});

test('restored-map protocol rejects garden checkpoints instead of misreading positions',()=>{
 const snapshot=new C.Battle({mode:'pve',participants:[{id:'p0',controller:'human',tankType:'human',weaponType:'pistol',spawn:0}]}).snapshot();
 assert.ok(C.VERSION>38);
 snapshot.version=38;
 assert.throws(()=>S.validateSnapshot(snapshot),/Invalid snapshot header/);
});
