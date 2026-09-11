/* Cosmetic impulses only: never write to authority snapshots or mouse aim. */
(window.TankClient ??= {}).recoil = {
  profiles: {
    standard: { barrel: 0.52, body: 0.055, recovery: 10 },
    rapid: { barrel: 0.20, body: 0.018, recovery: 19 },
    rocket: { barrel: 0.30, body: 0.045, recovery: 9 },
    laser: { barrel: 0.12, body: 0.025, recovery: 14 },
  },
  kick(value, strength = 1) { return Math.min(1.25, value + strength); },
  decay(value, dt, recovery) {
    const next = value * Math.exp(-Math.max(0, dt) * recovery);
    return next < 0.001 ? 0 : next;
  },
};
