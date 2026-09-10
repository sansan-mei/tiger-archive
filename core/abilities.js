/* Shared ability metadata: authority, validators, UI and documentation use this table. */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TankAbilities = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  "use strict";
  const definitions = {
    dash: {
      name: "矢量冲刺",
      duration: 30,
      cooldown: 480,
      burstSpeed: 26,
      allowReverse: true,
      barrier: 0,
      speedFactor: 1,
      damageFactor: 1,
      frontDot: 1,
    },
    barrier: {
      name: "应急屏障",
      duration: 240,
      cooldown: 720,
      burstSpeed: 0,
      allowReverse: false,
      barrier: 60,
      speedFactor: 1,
      damageFactor: 1,
      frontDot: 1,
    },
    deploy: {
      name: "堡垒部署",
      duration: 300,
      cooldown: 840,
      burstSpeed: 0,
      allowReverse: false,
      barrier: 0,
      speedFactor: 0.35,
      damageFactor: 0.3,
      frontDot: 0.5,
    },
    dodge: {
      name: "短距闪避",
      duration: 15,
      cooldown: 240,
      burstSpeed: 16,
      allowReverse: false,
      barrier: 0,
      speedFactor: 1,
      damageFactor: 1,
      frontDot: 1,
    },
  };
  for (const spec of Object.values(definitions)) Object.freeze(spec);
  Object.freeze(definitions);
  function describe(id) {
    const s = definitions[id],
      effect = s.barrier
        ? "临时护盾 +" + s.barrier
        : s.burstSpeed
          ? "可同时开火，无无敌"
          : "正面减伤 " +
            Math.round((1 - s.damageFactor) * 100) +
            "%，移动速度 " +
            Math.round(s.speedFactor * 100) +
            "%";
    return (
      s.name +
      " · " +
      effect +
      " · 持续 " +
      s.duration / 60 +
      " 秒 / 冷却 " +
      s.cooldown / 60 +
      " 秒"
    );
  }
  return Object.freeze({ definitions, describe });
});
