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
  scene.background = new T.Color(0x8cbedf);
  scene.fog = new T.Fog(0xcad9ce, 115, 260);
  const camera = new T.PerspectiveCamera(65, 1, 0.1, 300);
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
  const turf = mat(0xa6b3a1),
    road = mat(0x829394),
    wall = mat(0xcbbfac),
    dark = mat(0x627e73),
    stripe = mat(0xf1d89b),
    rampMat = mat(0xb8b8a0);
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
        level.id ? road : turf,
        group,
      );
    block(11, 0.02, b * 2 - 2, 0, level.y + 0.015, 0, road, group);
    for (let n = -b + 3; n < b; n += 8)
      for (const side of [-1, 1]) {
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
      block(
        o.w + 0.2,
        0.16,
        o.d + 0.2,
        o.x,
        level.y + o.h + 0.08,
        o.z,
        dark,
        cover,
      );
      // Painted panels remain inside the authoritative cover footprint.
      for (let x = o.x - o.w / 2 + 1.4; x < o.x + o.w / 2 - 1; x += 2.5) {
        block(
          0.9,
          0.9,
          0.04,
          x,
          level.y + o.h * 0.6,
          o.z + o.d / 2 + 0.03,
          dark,
          cover,
        );
        block(
          1.1,
          0.09,
          0.15,
          x,
          level.y + o.h * 0.6 - 0.5,
          o.z + o.d / 2 + 0.06,
          stripe,
          cover,
        );
      }
      for (const side of [-1, 1])
        block(
          0.3,
          0.5,
          o.d + 0.06,
          o.x + side * (o.w / 2 - 0.3),
          level.y + o.h * 0.6,
          o.z,
          stripe,
          cover,
        );
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
  for (const ramp of C.MAP.ramps) {
    const a = ramp.a,
      b = ramp.b,
      low = C.MAP.levels[a.floor].y,
      high = C.MAP.levels[b.floor].y;
    const length = Math.hypot(b.z - a.z, high - low),
      angle = -Math.atan((high - low) / (b.z - a.z));
    const deck = block(
      ramp.width,
      0.6,
      length,
      a.x,
      (low + high) / 2 - 0.3,
      (a.z + b.z) / 2,
      rampMat,
      floorGroups[a.floor],
    );
    deck.rotation.x = angle;
    for (const side of [-1, 1]) {
      const rail = block(
        0.24,
        0.65,
        length,
        a.x + side * (ramp.width / 2 - 0.12),
        (low + high) / 2 + 0.35,
        (a.z + b.z) / 2,
        stripe,
        floorGroups[a.floor],
      );
      rail.rotation.x = angle;
    }
    for (const point of [a, b]) {
      const ring = new T.Mesh(
        new T.RingGeometry(3.3, 3.55, 40),
        new T.MeshBasicMaterial({
          color: 0x8ff0ce,
          side: T.DoubleSide,
          transparent: true,
          opacity: 0.7,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(point.x, C.MAP.levels[point.floor].y + 0.05, point.z);
      floorGroups[point.floor].add(ring);
    }
  }
  // Original low-poly scenery, outside the playable boundary: warm summer outskirts.
  const scenery = new T.Group();
  scene.add(scenery);
  const leafGeometry = new T.IcosahedronGeometry(1, 0),
    treeTrunk = new T.CylinderGeometry(0.25, 0.38, 1, 5);
  const foliage = new T.InstancedMesh(leafGeometry, mat(0xffffff), 72),
    trunks = new T.InstancedMesh(treeTrunk, mat(0x8c8970), 24);
  const transform = new T.Object3D();
  foliage.castShadow = true;
  foliage.receiveShadow = true;
  trunks.castShadow = true;
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2,
      ring = 79 + (i % 4) * 5,
      x = Math.cos(angle) * ring,
      z = Math.sin(angle) * ring;
    transform.position.set(x, 3.1, z);
    transform.rotation.set(0, 0, 0);
    transform.scale.set(1, 6.2, 1);
    transform.updateMatrix();
    trunks.setMatrixAt(i, transform.matrix);
    for (let j = 0; j < 3; j++) {
      transform.position.set(
        x + Math.cos(j * 2.1) * 2,
        7 + j * 0.8,
        z + Math.sin(j * 2.1) * 2,
      );
      transform.rotation.set(i * 0.2, j * 0.6, i * 0.07);
      transform.scale.set(4.3 + j * 0.5, 4 + j * 0.35, 4.5);
      transform.updateMatrix();
      foliage.setMatrixAt(i * 3 + j, transform.matrix);
      foliage.setColorAt(
        i * 3 + j,
        new T.Color([0x739b7c, 0x91ac83, 0x5d8977][(i + j) % 3]),
      );
    }
  }
  scenery.add(foliage, trunks);
  const meadow = block(450, 0.7, 450, 0, -1.1, 0, mat(0x9ab48b), scenery);
  for (let i = 0; i < 12; i++) {
    const angle = (i / 12) * Math.PI * 2,
      hill = new T.Mesh(leafGeometry, mat(i % 2 ? 0x9eb58d : 0x87aa91));
    hill.position.set(Math.cos(angle) * 150, -1, Math.sin(angle) * 150);
    hill.scale.set(35, 18 + (i % 4) * 5, 31);
    hill.rotation.y = angle;
    scenery.add(hill);
  }
  const stucco = mat(0xe9d5b0),
    terracotta = mat(0xcb907b),
    windowPaint = mat(0x739198);
  for (const side of [-1, 1])
    for (let i = 0; i < 3; i++) {
      const house = new T.Group();
      house.position.set(side * (100 + (i % 2) * 9), 0, -55 + i * 48);
      house.rotation.y = (side * Math.PI) / 2;
      scenery.add(house);
      block(12, 7, 9, 0, 2.5, 0, stucco, house);
      const roof = new T.Mesh(new T.ConeGeometry(9, 3.2, 4), terracotta);
      roof.rotation.y = Math.PI / 4;
      roof.position.y = 7.6;
      roof.scale.z = 0.8;
      house.add(roof);
      for (const x of [-3, 3])
        block(2, 2, 0.12, x, 3, 4.56, windowPaint, house);
      block(1.5, 2.8, 0.12, 0, 0.8, 4.56, windowPaint, house);
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
      console.warn("维修基地外观加载失败，保留基础掩体：", error.message),
  });
  return {
    environmentReady: environment.ready,
    covers,
    renderer,
    scene,
    camera,
    sun,
    floorGroups,
    foliage,
    clouds,
    mat,
    block,
    stripe,
  };
};
