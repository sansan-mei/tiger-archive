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
  renderer.toneMapping = T.NoToneMapping;
  renderer.toneMappingExposure = 1.0;
  const scene = new T.Scene();
  scene.background = new T.Color(0xffc982);
  scene.fog = new T.Fog(0xffd093, 95, 230);
  const camera = new T.PerspectiveCamera(25, 1, 0.1, 500);
  scene.add(new T.HemisphereLight(0xfff0d2, 0x787193, 1.0));
  const sun = new T.DirectionalLight(0xffefcf, 1.8);
  sun.position.set(-36, 48, 28);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -65,
    right: 65,
    top: 65,
    bottom: -65,
    near: 1,
    far: 160,
  });
  sun.shadow.normalBias = 0.06;
  sun.shadow.bias = -0.0002;
  scene.add(sun);
  scene.add(sun.target);
  const mat = (color) => new T.MeshStandardMaterial({ color, roughness: 1 });
  const style = window.TankClient.createWoodlandStyle({T});
  const stripe = mat(0xf1d89b);
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
  const transform = new T.Object3D();
  const clouds = new T.Group();
  scene.add(clouds);
  const cloudMaterial = new T.MeshBasicMaterial({
    color: 0xf2ded0,
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
  clouds.visible = false;
  const folio = window.TankClient.createFolioScene({T,C,style,onError:error=>failure("原地图加载失败："+error.message)});
  floorGroups[0].add(folio.root);
  const atmosphere=window.TankClient.createAtmosphere({T,renderer,scene,camera,sun,style,folio});
  function setMapMode() {
    floorGroups[0].visible = true;
    folio.root.visible = true;
  }
  return {
    environmentReady: Promise.all([style.ready, folio.ready]),
    setMapMode,
    renderFrame(time,target,focus) {
      style.updateOcclusion(camera,target,C);
      atmosphere.render(time,target,focus);
    },
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
