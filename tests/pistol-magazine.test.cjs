const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../battle-core.js');
const S = require('../battle-session.js');
function setup() {
  const b = new C.Battle({participants: [0,1].map(i => ({id:'p'+i, controller:'human', tankType:'human', weaponType:'pistol', spawn:i}))});
  b.start(); b.collision = () => null;
  return b;
}
test('pistol fires nine rounds then waits exactly 90 ticks, repeatedly', () => {
  const b = setup(), p = b.entities[0], times = [];
  for(let tick=1;tick<=600;tick++) {
    for(const e of b.step({p0:{fire:true}})) if(e.type==='shot' && e.id===p.id) times.push(tick);
  }
  assert.ok(times.length >= 19);
  for(let i=1;i<times.length;i++) assert.equal(times[i]-times[i-1], i%9===0 ? 90 : 24);
  assert.equal(C.WEAPONS.pistol.speed,360);
});
test('reload survives network projection and checkpoint; invalid ammo is rejected', () => {
  const b = setup(), p = b.entities[0];
  for(let i=0;i<9;i++) {p.cooldown=0; assert.equal(b.shoot(p),true);}
  assert.equal(p.ammo,0); assert.equal(p.cooldown,90);
  assert.equal(b.shoot(p),false);
  S.validateSnapshot(b.networkSnapshot(),{network:true});
  const checkpoint=b.snapshot(), restored=setup(); restored.restore(checkpoint);
  for(let i=0;i<89;i++) restored.step();
  assert.equal(restored.entities[0].ammo,0);
  assert.equal(restored.shoot(restored.entities[0]),false);
  restored.step(); assert.equal(restored.entities[0].ammo,9);
  assert.equal(restored.shoot(restored.entities[0]),true);
  const bad=b.snapshot();bad.entities[0].ammo=10;
  assert.throws(()=>S.validateSnapshot(bad));
});
