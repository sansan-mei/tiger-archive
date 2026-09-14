const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm'), T = require('three');
const C = require('../battle-core.js'), S = require('../battle-session.js');
const data = require('../client/environment/nature-kit.json');
// Geometry tests do not emulate browser image decoding (covered by the browser preview).
const untextured = structuredClone(data); delete untextured.images; delete untextured.textures;
for (const material of untextured.materials) delete material.map;
const context = vm.createContext({window: {}, AbortController, setTimeout, clearTimeout});
vm.runInContext(fs.readFileSync(require.resolve('../client/environment.js'), 'utf8'), context);
vm.runInContext(fs.readFileSync(require.resolve('../client/woodland-style.js'), 'utf8'), context);
function setup(fetchImpl, style) {
  const floorGroups = C.MAP.levels.map(() => new T.Group());
  const covers = new Map(C.MAP.obstacles.map(o => {
    const group = new T.Group(); group.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
    floorGroups[o.floor].add(group); return [o.id, group];
  }));
  const errors = [];
  return {...context.window.TankClient.createEnvironment({T,C,floorGroups,covers,style,fetchImpl,onError:e=>errors.push(e)}),floorGroups,covers,errors};
}
test('selected public nature kit has shared embedded textures, finite geometry and normalized rocks', () => {
  assert.equal(data.metadata.generator, 'Quaternius Stylized Nature MegaKit');
  assert.equal(data.object.children.length, 8);
  assert.ok(data.images.length <= 7 && data.images.every(i=>i.url.startsWith('data:image/png;base64,')));
  assert.ok(fs.statSync(require.resolve('../client/environment/nature-kit.json')).size < 6*1024*1024);
  const kit = new T.ObjectLoader().parse(untextured);
  for(const model of kit.children) {
    const box = new T.Box3().setFromObject(model);
    assert.ok(Math.abs(box.min.y)<1e-5 && Math.abs(box.max.y-1)<1e-5);
    if(model.name.startsWith('Rock_')) for(const axis of ['x','z']) {
      assert.ok(Math.abs(box.min[axis]+.5)<1e-5 && Math.abs(box.max[axis]-.5)<1e-5);
    }
    model.traverse(m=>{if(m.isMesh) assert.ok([...m.geometry.attributes.position.array].every(Number.isFinite));});
  }
});
test('nature replaces covers at their physical bounds and batches repeat vegetation deterministically', async () => {
  const before = JSON.stringify(C.MAP), fetch = async()=>({ok:true,json:async()=>untextured});
  const a=setup(fetch), b=setup(fetch); assert.ok(await a.ready); assert.ok(await b.ready);
  for(const o of C.MAP.obstacles.filter(o=>o.kind!=='tree')) {
    const box=new T.Box3().setFromObject(a.covers.get(o.id));
    for(const [axis,lo,hi] of [['x',o.x-o.w/2,o.x+o.w/2],['y',C.MAP.levels[o.floor].y,C.MAP.levels[o.floor].y+o.h],['z',o.z-o.d/2,o.z+o.d/2]])
      assert.ok(Math.abs(box.min[axis]-lo)<.001 && Math.abs(box.max[axis]-hi)<.001,o.id+axis);
  }
  const matrices=s=>s.floorGroups.flatMap(g=>g.getObjectByName('woodland-'+s.floorGroups.indexOf(g)).children.map(m=>({name:m.name,count:m.count,matrices:Array.from(m.instanceMatrix.array)})));
  assert.deepEqual(matrices(a),matrices(b));
  assert.ok(matrices(a).length<35,'vegetation uses bounded instanced draw calls');
  assert.equal(JSON.stringify(C.MAP),before);
});
test('ramp vegetation can be hidden for the ground-only PvE map',async()=>{
  const s=setup(async()=>({ok:true,json:async()=>untextured}));assert.ok(await s.ready);
  const rampMeshes=s.floorGroups.flatMap(g=>g.children).flatMap(g=>g.children).filter(m=>m.userData.rampOnly);
  assert.ok(rampMeshes.length>0);s.setMode('pve');assert.ok(rampMeshes.every(m=>!m.visible));
  s.setMode('pvp');assert.ok(rampMeshes.every(m=>m.visible));
});
test('failed or incomplete nature kit preserves every usable fallback', async () => {
  for(const fetch of [async()=>({ok:false}),async()=>({ok:true,json:async()=>({...untextured,object:{...untextured.object,children:[]}})})]) {
    const s=setup(fetch), original=[...s.covers.values()].map(c=>c.children[0]);
    assert.equal(await s.ready,false);assert.equal(s.errors.length,1);
    assert.deepEqual([...s.covers.values()].map(c=>c.children[0]),original);
    assert.ok(s.floorGroups.every(g=>!g.children.some(c=>c.name.startsWith('woodland-'))));
  }
});
test('expanded woodland has valid supplies, safe starts, solid trunks and reachable outer routes', () => {
  const b = new C.Battle(), p=b.entities[0];
  assert.equal(C.MAP.levels[0].bound,128);
  for(const s of [...C.MAP.spawns,...C.MAP.pickups])
    assert.ok(b.valid(s.x,s.z,s.floor,p,{ignoreEntities:true}),JSON.stringify(s));
  for(const o of C.MAP.obstacles.filter(o=>o.kind==='tree')) {
    assert.equal(b.valid(o.x,o.z,0,p,{ignoreEntities:true}),false,o.id);
    const hit=b.collision({x:o.x-3,y:1,z:o.z},{x:o.x+3,y:1,z:o.z},p.id);
    assert.ok(hit,o.id);
  }
  Object.assign(p,{x:0,z:110,y:0,floor:0});
  const route=b.route(p,{x:110,z:0});
  assert.ok(route.length>0 && route.some(p=>p.x>80));
  for(const point of route) assert.ok(b.valid(point.x,point.z,0,p,{ignoreEntities:true}));
  assert.equal(b.valid(128,0,0,p),false);
});
test('projectiles, authoritative checkpoints and replicas work beyond the old 80m limit', () => {
  const b=new C.Battle({participants:C.defaultParticipants().map(p=>({...p,controller:'human'}))});
  b.start(); const p=b.entities[0]; Object.assign(p,{x:0,z:110,y:0,floor:0,aim:Math.PI});
  b.step({[p.id]:{fire:true,aimYaw:Math.PI}});
  assert.ok(b.bullets.length && b.bullets[0].z>80);
  p.brain.path=[{x:0,z:112},{x:100,z:112}];
  const snapshot=b.snapshot(); S.validateSnapshot(snapshot);
  const copy=new C.Battle(); copy.restore(snapshot); assert.deepEqual(copy.snapshot(),snapshot);
  const a=new S.Authority();a.battle.restore(snapshot); const r=new S.Replica();r.welcome(a.attach('outer-peer',p.id)); assert.equal(r.receive(a.statePacket({network:true})).ok,true);
  assert.equal(r.current.entities[0].z,110);
  const bad=structuredClone(snapshot); bad.entities[0].x=C.MAP.worldLimit+1;
  assert.throws(()=>S.validateSnapshot(bad),/Invalid entity state/);
});
test('PvE hazard positions accept the expanded arena but reject coordinates beyond it', () => {
  const b=new C.Battle({mode:'pve',participants:[{id:'p1',controller:'human',tankType:'human',weaponType:'rocket'}]});
  b.start();b.tick=1;b.pve.wave=7;b.pve.nextWaveAt=1;b.step();
  const p=b.entities[0]; Object.assign(p,{x:100,z:110});
  b.pve.boss.telegraph={at:b.tick+90,zones:[{x:100,y:0,z:110,radius:6}]};
  const s=b.snapshot();S.validateSnapshot(s);
  s.pve.boss.telegraph.zones[0].x=C.MAP.worldLimit+1;
  assert.throws(()=>S.validateSnapshot(s));
  s.pve.boss.telegraph.zones[0].x=100;s.pve.boss.telegraph.zones[0].y=8;
  assert.throws(()=>S.validateSnapshot(s),/Invalid boss warning/);
});

test('Folio foliage preserves collisions, batches crowns and supplies ground contact shadows', async () => {
  const style=context.window.TankClient.createWoodlandStyle({T,loadTextures:false});
  const before=JSON.stringify(C.MAP);
  const s=setup(async()=>({ok:true,json:async()=>untextured}),style);
  assert.ok(await s.ready);
  style.addDetails(C,s.floorGroups);
  const leaves=[],trunks=[];
  for(const group of s.floorGroups) group.traverse(o=>{
    if(o.material?.name==='garden-foliage')leaves.push(o);
    if(o.material?.name==='Bark_Garden')trunks.push(o);
  });
  assert.ok(leaves.length>0 && leaves.length<=9);
  assert.ok(trunks.length>0);
  for(const mesh of leaves) {
    assert.ok(mesh.isInstancedMesh && mesh.instanceColor);
    assert.equal(mesh.userData.aimIgnore,true);
    assert.equal(mesh.material.alphaTest,.3);
    assert.ok([...mesh.geometry.attributes.position.array,...mesh.instanceMatrix.array].every(Number.isFinite));
    assert.ok(mesh.count>0 && mesh.count%5===0);
    const a=new T.Matrix4(),b=new T.Matrix4();mesh.getMatrixAt(0,a);mesh.getMatrixAt(1,b);
    assert.notDeepEqual(a.elements,b.elements,'crown lobes retain their local offsets');
  }
  assert.ok(trunks.every(t=>!t.userData.aimIgnore));
  for(const group of s.floorGroups) {
    const shadow=group.getObjectByName('garden-contact-shadows');
    assert.equal(shadow.count,C.MAP.obstacles.filter(o=>o.floor===s.floorGroups.indexOf(group)).length);
    assert.equal(shadow.userData.aimIgnore,true);
  }
  for(const o of C.MAP.obstacles.filter(o=>o.kind!=='tree')) {
    const box=new T.Box3().setFromObject(s.covers.get(o.id));
    assert.ok(Math.abs(box.min.x-(o.x-o.w/2))<.001);
    assert.ok(Math.abs(box.max.y-(C.MAP.levels[o.floor].y+o.h))<.001);
  }
  assert.equal(JSON.stringify(C.MAP),before);
});
