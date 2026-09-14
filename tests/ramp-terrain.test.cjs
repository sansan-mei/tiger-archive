const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),vm=require('node:vm'),T=require('three');
const C=require('../battle-core.js');
function terrain(){
  const context=vm.createContext({window:{}});
  vm.runInContext(fs.readFileSync(require.resolve('../client/ramp-terrain.js'),'utf8'),context);
  const floorGroups=C.MAP.levels.map(()=>new T.Group());
  context.window.TankClient.createRampTerrain({T,C,floorGroups});
  floorGroups.forEach(g=>g.updateMatrixWorld(true));return floorGroups;
}
test('all four natural trails follow the exact authority height and use bounded draw calls',()=>{
  const groups=terrain();
  for(const r of C.MAP.ramps){
    const group=groups[r.a.floor].getObjectByName('trail-'+r.id);
    assert.equal(group.children.length,7);
    for(let i=1;i<20;i++){
      const z=r.a.z+(r.b.z-r.a.z)*i/20,y=C.rampHeight(C.MAP,r,z);
      const hits=new T.Raycaster(new T.Vector3(r.a.x,y+3,z),new T.Vector3(0,-1,0)).intersectObject(group,true);
      assert.ok(hits.length && Math.abs(hits[0].point.y-y)<.02,r.id+' road height');
    }
    assert.equal(group.getObjectByName('trail-sand').material.color.getHex(),0xd5af79);
    assert.equal(group.children.filter(m=>m.userData.rampSupport).length,2);
  }
});
test('solid ramp ends block bullets where the rendered embankment stands, in both directions',()=>{
  const groups=terrain(),b=new C.Battle();
  for(const r of C.MAP.ramps){
    const group=groups[r.a.floor].getObjectByName('trail-'+r.id);
    for(const support of C.rampSupports(C.MAP,r)) for(const side of [-1,1]){
      const z=(support.z0+support.z1)/2,base=C.MAP.levels[r.a.floor].y;
      const y=(base+C.rampHeight(C.MAP,r,z)-.6)/2;
      const a={x:r.a.x+side*9,y,z},end={x:r.a.x-side*9,y,z};
      const hit=b.collision(a,end,null,{bodies:false});
      assert.equal(hit?.kind,'ramp');assert.equal(hit.id,r.id);
      const visual=new T.Raycaster(new T.Vector3(a.x,y,z),new T.Vector3(-side,0,0)).intersectObject(group,true)[0];
      assert.ok(visual);assert.ok(Math.abs(visual.point.x-hit.point.x)<.03);
    }
  }
});
test('crosswise culverts remain passable, while the new high abutments are solid to movement',()=>{
  const b=new C.Battle(),p=b.entities[0];
  for(const r of C.MAP.ramps){
    const z=r.a.z+(r.b.z-r.a.z)*.8;
    assert.equal(b.valid(r.a.x,z,r.a.floor,p,{ignoreEntities:true}),true);
    assert.equal(b.collision({x:r.a.x-9,y:C.MAP.levels[r.a.floor].y+2,z},
      {x:r.a.x+9,y:C.MAP.levels[r.a.floor].y+2,z},null,{bodies:false}),null);
    const support=C.rampSupports(C.MAP,r)[1];
    assert.equal(b.valid(r.a.x,(support.z0+support.z1)/2,r.a.floor,p,{ignoreEntities:true}),false);
  }
});
test('flared landings stay on their destination decks and do not bridge a ramp opening',()=>{
  for(const [i,group] of terrain().entries()) for(const mesh of group.children.filter(m=>m.name==='trail-landing')){
    const vertices=mesh.geometry.attributes.position;
    for(let n=0;n<vertices.count;n++){
      const x=vertices.getX(n),z=vertices.getZ(n);
      assert.ok(C.deckRects(C.MAP,C.MAP.levels[i]).some(q=>x>=q.x0-1e-5&&x<=q.x1+1e-5&&z>=q.z0-1e-5&&z<=q.z1+1e-5));
    }
  }
});
