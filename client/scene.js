/* Static scene construction; no input or room lifecycle. */
(window.TankClient ??= {}).createScene = function ({ T, C, canvas, failure }) {
  let renderer;
  try {
    renderer = new T.WebGLRenderer({
      canvas,
      antialias: true,
      powerPreference: "high-performance",
    });
  } catch {
    failure("无法创建 WebGL 画面，请检查浏览器硬件加速。");
    return {};
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  const scene = new T.Scene();
  scene.background = new T.Color(0xb6dce2);
  scene.fog = new T.Fog(0xd0dfb7, 155, 370);
  const camera = new T.PerspectiveCamera(65, 1, 0.1, 500);
  scene.add(new T.HemisphereLight(0xfff5e5, 0x648a7a, 1.8));
  const sun = new T.DirectionalLight(0xffecd1, 2.4);
  sun.position.set(-36, 48, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -45,
    right: 45,
    top: 45,
    bottom: -45,
    near: 1,
    far: 160,
  });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  scene.add(sun.target);
  const mat = (color) => new T.MeshToonMaterial({ color });
  const turf = mat(0x80b866),
    wall = mat(0x9c9c85),
    dark = mat(0x857c62),
    stripe = mat(0xf1d89b),
    rampMat = mat(0xcdb486);
  const geometry = new T.BoxGeometry(1, 1, 1),
    floorGroups = C.MAP.levels.map(() => new T.Group());
  floorGroups.forEach((g) => scene.add(g));
  function block(w, h, d, x, y, z, material, parent) {
    const m = new T.Mesh(geometry, material);
    m.scale.set(w, h, d);
    m.position.set(x, y, z);
    m.castShadow = true;
    m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }
  const covers = new Map();
  for (const level of C.MAP.levels) {
    const group = floorGroups[level.id],
      b = level.bound;
    for (const q of C.deckRects(C.MAP, level))
      block(
        q.x1 - q.x0,
        0.6,
        q.z1 - q.z0,
        (q.x0 + q.x1) / 2,
        level.y - 0.3,
        (q.z0 + q.z1) / 2,
        turf,
        group,
      );
    block(11, 0.02, b * 2 - 2, 0, level.y + 0.015, 0, rampMat, group);
    if (!level.id) {
      block(b * 2 - 2, .02, 9, 0, .016, 0, rampMat, group);
      const path = new T.Mesh(new T.RingGeometry(97, 107, 128), rampMat);
      path.rotation.x = -Math.PI / 2; path.position.y = .029;
      path.receiveShadow = true; group.add(path);
    }
    for (let n = -b + 3; n < b; n += 8)
      for (const side of [-1, 1]) {
        if (level.id) {
          // Paint the exposed edge instead of drawing an impassable-looking rail.
          block(0.5, 0.025, 5, side * (b - 0.4), level.y + 0.02, n, stripe, group);
          block(5, 0.025, 0.5, n, level.y + 0.02, side * (b - 0.4), stripe, group);
          continue;
        }
        block(1, 0.9, 5, side * (b + 0.2), level.y + 0.45, n, dark, group);
        const exit = (C.MAP.dropExits || []).find(
          (e) =>
            e.floor === level.id &&
            e.side === side &&
            Math.abs(n - e.x) < e.width / 2 + 2.5,
        );
        if (!exit)
          block(5, 0.9, 1, n, level.y + 0.45, side * (b + 0.2), dark, group);
      }
    if (level.id)
      for (const x of [-44, 44])
        for (const z of [-44, 44])
          block(1.1, 8, 1.1, x, level.y - 4, z, dark, group);
    for (const o of C.MAP.obstacles.filter((o) => o.floor === level.id)) {
      const cover = new T.Group();
      cover.name = "cover-" + o.id;
      covers.set(o.id, cover);
      group.add(cover);
      block(o.w, o.h, o.d, o.x, level.y + o.h / 2, o.z, wall, cover);

    }
  }
  for (const exit of C.MAP.dropExits || []) {
    const level = C.MAP.levels[exit.floor],
      group = floorGroups[exit.floor];
    const dropPaint = mat(0xe9a449);
    for (const offset of [-4, 0, 4]) {
      block(
        8,
        0.035,
        0.8,
        exit.x,
        level.y + 0.03,
        exit.side * (level.bound - 7 - offset),
        dropPaint,
        group,
      );
    }
    for (const side of [-1, 1])
      block(
        0.35,
        1.6,
        0.35,
        exit.x + (side * exit.width) / 2,
        level.y + 0.8,
        exit.side * (level.bound - 0.4),
        dropPaint,
        group,
      );
  }
  window.TankClient.createRampTerrain({T, C, floorGroups});
  const scenery = new T.Group(); scene.add(scenery);
  const transform = new T.Object3D();
  block(600, .7, 600, 0, -1.1, 0, mat(0x91ad73), scenery);
  for (let i = 0; i < 16; i++) {
    const angle = i / 16 * Math.PI * 2;
    const hill = new T.Mesh(new T.IcosahedronGeometry(1, 1), mat(i % 2 ? 0x97b87d : 0x83a67b));
    hill.position.set(Math.cos(angle)*224, -5, Math.sin(angle)*224);
    hill.scale.set(45, 24+(i%4)*6, 39); hill.rotation.y=angle; scenery.add(hill);
  }
  const clouds = new T.Group();
  scene.add(clouds);
  const cloudMaterial = new T.MeshBasicMaterial({
    color: 0xffe6b6,
    fog: false,
  });
  const cloudMesh = new T.InstancedMesh(
    new T.IcosahedronGeometry(1, 1),
    cloudMaterial,
    36,
  );
  for (let i = 0; i < 36; i++) {
    const cluster = Math.floor(i / 4),
      j = i % 4,
      angle = (cluster / 9) * Math.PI * 2;
    transform.position.set(
      Math.cos(angle) * 160 + j * 6,
      55 + (cluster % 3) * 8 + (j % 2) * 2,
      Math.sin(angle) * 160,
    );
    transform.rotation.set(0, j * 0.5, 0);
    transform.scale.set(10 + (j % 2) * 3, 4 + (j % 3), 7);
    transform.updateMatrix();
    cloudMesh.setMatrixAt(i, transform.matrix);
  }
  clouds.add(cloudMesh);
  const environment = window.TankClient.createEnvironment({
    T,
    C,
    floorGroups,
    covers,
    onError: (error) =>
      console.warn("林地素材加载失败，保留基础掩体：", error.message),
  });
  return {
    environmentReady: environment.ready,
    covers,
    renderer,
    scene,
    camera,
    sun,
    floorGroups,
    clouds,
    mat,
    block,
    stripe,
  };
};
