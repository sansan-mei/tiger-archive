const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm"),
  fs = require("node:fs");
const C = require("../battle-core.js");
function setup(
  fetchImpl = async () => ({
    ok: true,
    arrayBuffer: async () => new ArrayBuffer(8),
  }),
) {
  const sources = [],
    gains = [];
  let errors = 0,
    fetches = 0;
  const param = () => ({
    value: 0,
    target: null,
    setTargetAtTime(v, at, tau) {
      assert.ok(Number.isFinite(v) && v >= 0 && Number.isFinite(at) && tau > 0);
      this.target = v;
    },
    cancelScheduledValues() {},
  });
  const audio = {
    state: "running",
    currentTime: 0,
    destination: {},
    decodeAudioData: async () => ({ duration: 5.5935 }),
    createBufferSource() {
      const node = {
        playbackRate: param(),
        connect() {},
        start() {
          this.started = true;
        },
      };
      sources.push(node);
      return node;
    },
    createGain() {
      const node = { gain: param(), connect() {} };
      gains.push(node);
      return node;
    },
  };
  const ctx = vm.createContext({
    window: {},
    AbortController,
    setTimeout,
    clearTimeout,
  });
  vm.runInContext(
    fs.readFileSync(require.resolve("../client/engine-audio.js"), "utf8"),
    ctx,
  );
  const engine = ctx.window.TankClient.createEngineAudio({
    audio,
    C,
    fetchImpl: (...args) => {
      fetches++;
      return fetchImpl(...args);
    },
    onError: () => errors++,
  });
  return {
    engine,
    audio,
    sources,
    output: gains[0],
    stats: () => ({ errors, fetches }),
  };
}
test("recorded motor loads once and reuses one looping voice with bounded speed and gain", async () => {
  const { engine, sources, output, stats } = setup();
  const first = engine.load();
  assert.equal(engine.load(), first);
  assert.equal(await first, true);
  const source = sources[0];
  assert.ok(source.loop && source.started && source.buffer);
  const rates = [];
  for (const tankType of ["light", "medium", "heavy"]) {
    const p = { tankType, alive: true, speed: 4 };
    engine.update(p, true);
    rates.push(source.playbackRate.target);
    const slow = output.gain.target;
    p.speed = C.TANKS[tankType].speed;
    engine.update(p, true);
    const full = output.gain.target;
    assert.ok(full > slow && full <= 0.048);
    p.speed *= 10;
    engine.update(p, true);
    assert.equal(output.gain.target, full);
    p.speed *= -1;
    engine.update(p, true);
    assert.equal(output.gain.target, full);
    for (let i = 0; i < 1000; i++) engine.update(p, true);
  }
  assert.ok(rates[0] > rates[1] && rates[1] > rates[2]);
  await engine.load();
  assert.equal(sources.length, 1);
  assert.deepEqual(stats(), { errors: 0, fetches: 1 });
});
test("idle, human, death, falling, pause and suspended audio mute the recording and recover", async () => {
  const { engine, output, audio } = setup();
  await engine.load();
  const active = { tankType: "medium", alive: true, falling: false, speed: 7 };
  for (const changes of [
    { speed: 0 },
    { speed: 0.1 },
    { tankType: "human" },
    { alive: false },
    { falling: true },
  ]) {
    engine.update({ ...active, ...changes }, true);
    assert.equal(output.gain.target, 0);
    engine.update(active, true);
    assert.ok(output.gain.target > 0);
  }
  engine.update(active, false);
  assert.equal(output.gain.target, 0);
  audio.state = "suspended";
  engine.update(active, true);
  assert.equal(output.gain.target, 0);
  audio.state = "running";
  engine.update(active, true);
  assert.ok(output.gain.target > 0);
  engine.mute();
  assert.equal(output.gain.target, 0);
});
test("failed audio can retry, and a load completing after pause stays silent", async () => {
  let reject = true,
    finish;
  const { engine, output, sources, stats } = setup(async () => {
    if (reject) throw new Error("offline");
    await new Promise((resolve) => {
      finish = resolve;
    });
    return { ok: true, arrayBuffer: async () => new ArrayBuffer(8) };
  });
  assert.equal(await engine.load(), false);
  assert.equal(sources.length, 0);
  reject = false;
  const pending = engine.load();
  engine.update({ tankType: "heavy", alive: true, speed: 8 }, true);
  engine.mute();
  finish();
  assert.equal(await pending, true);
  assert.equal(output.gain.target, 0);
  assert.deepEqual(stats(), { errors: 1, fetches: 2 });
});
