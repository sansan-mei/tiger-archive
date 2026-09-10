const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const T = require("three");
const C = require("../battle-core.js");
const data = require("../client/environment/maintenance-kit.json");
const context = vm.createContext({
  window: {},
  AbortController,
  setTimeout,
  clearTimeout,
});
vm.runInContext(
  fs.readFileSync(require.resolve("../client/environment.js"), "utf8"),
  context,
);
function setup(fetchImpl) {
  const floorGroups = C.MAP.levels.map(() => new T.Group());
  const covers = new Map(
    C.MAP.obstacles.map((o) => {
      const cover = new T.Group();
      cover.add(new T.Mesh(new T.BoxGeometry(), new T.MeshBasicMaterial()));
      floorGroups[o.floor].add(cover);
      return [o.id, cover];
    }),
  );
  const errors = [];
  const env = context.window.TankClient.createEnvironment({
    T,
    C,
    floorGroups,
    covers,
    fetchImpl,
    onError: (e) => errors.push(e),
  });
  return { ...env, floorGroups, covers, errors };
}
test("Blender kit stays within normalized cover bounds and a small untextured geometry budget", () => {
  const kit = new T.ObjectLoader().parse(data);
  assert.deepEqual(
    kit.children.map((m) => m.name),
    ["workshop", "cargo", "power"],
  );
  let triangles = 0,
    meshes = 0;
  for (const model of kit.children) {
    const box = new T.Box3().setFromObject(model);
    for (const [axis, lo, hi] of [
      ["x", -0.5, 0.5],
      ["y", 0, 1],
      ["z", -0.5, 0.5],
    ]) {
      assert.ok(
        box.min[axis] >= lo - 0.001 && box.max[axis] <= hi + 0.001,
        model.name + axis,
      );
      assert.ok(box.max[axis] - box.min[axis] > 0.99);
    }
    model.traverse((m) => {
      if (!m.isMesh) return;
      meshes++;
      triangles += m.geometry.index.count / 3;
      assert.ok(
        [
          ...m.geometry.attributes.position.array,
          ...m.geometry.attributes.normal.array,
        ].every(Number.isFinite),
      );
      assert.equal(m.material.map, null);
      assert.ok(m.castShadow && m.receiveShadow);
    });
  }
  assert.ok(triangles <= 7000 && meshes <= 20);
  assert.equal(data.images, undefined);
});
test("scenery fits authoritative obstacles, keeps closed door fronts and shares cloned geometry", async () => {
  const before = JSON.stringify(C.MAP);
  const s = setup(async () => ({ ok: true, json: async () => data }));
  assert.equal(await s.ready, true);
  for (const o of C.MAP.obstacles) {
    if (o.h < 2 || Math.min(o.w, o.d) < 4) continue;
    const cover = s.covers.get(o.id);
    assert.equal(cover.parent, s.floorGroups[o.floor]);
    const box = new T.Box3().setFromObject(cover);
    const y = C.MAP.levels[o.floor].y;
    for (const [axis, lo, hi] of [
      ["x", o.x - o.w / 2, o.x + o.w / 2],
      ["y", y, y + o.h],
      ["z", o.z - o.d / 2, o.z + o.d / 2],
    ]) {
      assert.ok(
        Math.abs(box.min[axis] - lo) < 0.015 &&
          Math.abs(box.max[axis] - hi) < 0.015,
        o.id + axis,
      );
    }
    const ray = new T.Raycaster(
      new T.Vector3(o.x, y + o.h * 0.4, o.z + o.d / 2 + 2),
      new T.Vector3(0, 0, -1),
    );
    const hits = ray.intersectObject(cover, true);
    assert.ok(hits.length && hits[0].distance < 2.3, "closed front " + o.id);
  }
  assert.equal(
    s.covers.get("g1").children[0].children[0].geometry,
    s.covers.get("g3").children[0].children[0].geometry,
  );
  assert.equal(JSON.stringify(C.MAP), before);
});
test("failed scenery request retains usable placeholder covers", async () => {
  const s = setup(async () => ({ ok: false }));
  const original = [...s.covers.values()].map((c) => c.children[0]);
  assert.equal(await s.ready, false);
  assert.equal(s.errors.length, 1);
  assert.deepEqual(
    [...s.covers.values()].map((c) => c.children[0]),
    original,
  );
});
test("instanced apron markings do not cross deck edges or ramp openings", async () => {
  const s = setup(async () => ({ ok: false }));
  await s.ready;
  const matrix = new T.Matrix4();
  for (const level of C.MAP.levels) {
    for (const mesh of s.floorGroups[level.id].children.filter(
      (m) => m.isInstancedMesh,
    )) {
      for (let i = 0; i < mesh.count; i++) {
        mesh.getMatrixAt(i, matrix);
        for (const x of [-0.5, 0.5])
          for (const z of [-0.5, 0.5]) {
            const p = new T.Vector3(x, 0, z).applyMatrix4(matrix);
            assert.ok(
              C.deckRects(C.MAP, level).some(
                (q) => p.x >= q.x0 && p.x <= q.x1 && p.z >= q.z0 && p.z <= q.z1,
              ),
            );
            assert.ok(
              !C.MAP.ramps.some(
                (r) =>
                  Math.abs(p.x - r.a.x) < r.width / 2 &&
                  p.z > Math.min(r.a.z, r.b.z) &&
                  p.z < Math.max(r.a.z, r.b.z),
              ),
            );
          }
      }
    }
  }
});
