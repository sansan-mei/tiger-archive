(window.TankClient ??= {}).createEffects = function ({
  T,
  scene,
  sphere,
  effects,
  getAudio,
}) {
  function sound(laser = false, volume = 1) {
    const audio = getAudio();
    if (!audio || audio.state !== "running") return;
    const at = audio.currentTime,
      o = audio.createOscillator(),
      g = audio.createGain();
    o.type = laser ? "sine" : "triangle";
    o.frequency.setValueAtTime(laser ? 550 : 140, at);
    o.frequency.exponentialRampToValueAtTime(laser ? 100 : 28, at + 0.2);
    g.gain.setValueAtTime(0.10 * Math.max(0, Math.min(1, volume)), at);
    g.gain.exponentialRampToValueAtTime(0.001, at + 0.23);
    o.connect(g);
    g.connect(audio.destination);
    o.start(at);
    o.stop(at + 0.24);
  }
  function puff(point, size = 1, count = 6) {
    count=Math.min(count,Math.max(0,160-effects.length));
    for (let i = 0; i < count; i++) {
      const material = new T.MeshBasicMaterial({
        color: i % 3 ? 0xeaa15a : 0x555d4c,
        transparent: true,
        opacity: 1,
      });
      const m = new T.Mesh(sphere, material);
      m.position.set(point.x, point.y, point.z);
      m.scale.setScalar(0.2 * size);
      scene.add(m);
      effects.push({
        m,
        age: 0,
        life: 0.5 + size * 0.25,
        size,
        dx: Math.cos((i / count) * 6.28) * size * 3,
        dz: Math.sin((i / count) * 6.28) * size * 3,
        dy: 2 + (i % 3),
      });
    }
  }
  function beam(event) {
    const from = new T.Vector3(event.from.x, event.from.y, event.from.z),
      to = new T.Vector3(event.to.x, event.to.y, event.to.z);
    const m = new T.Mesh(
      new T.CylinderGeometry(
        event.radius || 0.045 + event.power * 0.07,
        event.radius || 0.045 + event.power * 0.07,
        from.distanceTo(to),
        8,
      ),
      new T.MeshBasicMaterial({
        color: 0x96f9ff,
        transparent: true,
        opacity: 1,
      }),
    );
    m.position.copy(from).add(to).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(
      new T.Vector3(0, 1, 0),
      to.sub(from).normalize(),
    );
    scene.add(m);
    effects.push({ m, age: 0, life: 0.24, beam: true, dx: 0, dz: 0, dy: 0 });
  }
  return { sound, puff, beam };
};
