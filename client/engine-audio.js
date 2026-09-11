/* Recorded tank driving loop, loaded once locally; no oscillator fallback. */
(window.TankClient ??= {}).createEngineAudio = function ({
  audio,
  C,
  fetchImpl = (...args) => globalThis.fetch(...args),
  onError = () => {},
}) {
  const output = audio.createGain();
  output.gain.value = 0;
  output.connect(audio.destination);
  let source = null,
    loading = null;
  const profiles = {
    light: { rate: 1.04, volume: 0.036 },
    medium: { rate: 0.94, volume: 0.042 },
    heavy: { rate: 0.84, volume: 0.048 },
  };
  function load() {
    if (source) return Promise.resolve(true);
    if (loading) return loading;
    loading = (async () => {
      const controller = new AbortController();
      const timer = globalThis.setTimeout(() => controller.abort(), 8000);
      try {
        const response = await fetchImpl("client/audio/tank-drive.mp3", {
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Driving audio unavailable");
        const data = await response.arrayBuffer();
        const buffer = await audio.decodeAudioData(data);
        const node = audio.createBufferSource();
        node.buffer = buffer;
        node.loop = true;
        node.connect(output);
        node.start();
        source = node;
        return true;
      } catch {
        onError();
        return false;
      } finally {
        globalThis.clearTimeout(timer);
        loading = null;
      }
    })();
    return loading;
  }
  function mute() {
    const at = audio.currentTime;
    output.gain.cancelScheduledValues(at);
    output.gain.setTargetAtTime(0, at, 0.025);
  }
  function update(player, playing) {
    const spec = C.TANKS[player.tankType],
      profile = profiles[player.tankType] || profiles.medium;
    const active =
      playing &&
      player.alive &&
      !player.falling &&
      spec.movement !== "strafe" &&
      audio.state === "running";
    const speed = Math.min(1, Math.abs(player.speed) / spec.speed),
      motion = Math.max(0, Math.min(1, (Math.abs(player.speed) - 0.15) / 2)),
      at = audio.currentTime;
    output.gain.setTargetAtTime(
      active ? profile.volume * motion * (0.55 + 0.45 * speed) : 0,
      at,
      active ? 0.16 : 0.035,
    );
    source?.playbackRate.setTargetAtTime(profile.rate + speed * 0.24, at, 0.25);
  }
  return { load, update, mute };
};
