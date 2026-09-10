(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.buildTrackedHull = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  return function ({
    tankType,
    block,
    cylinder,
    paint,
    edge,
    rubber,
    glow,
    accent,
    ink,
    tank,
    wheels,
  }) {
    const light = tankType === "light",
      heavy = tankType === "heavy";
    block(light ? 4.65 : 5.1, 0.8, light ? 2.35 : 2.7, 0, 1.22, 0);
    block(4.8, 0.22, light ? 2.65 : 3.1, 0, 1.62, 0, edge);
    const nose = block(0.9, 0.6, light ? 2.1 : 2.65, -2.1, 1.27, 0);
    nose.rotation.z = -0.2;
    for (const side of [-1, 1]) {
      if (!light) block(5.35, 0.95, 0.65, 0, 0.69, side * 1.52, rubber);
      const count = light ? 3 : 5;
      for (let i = 0; i < count; i++) {
        const x = -1.85 + (i * 3.7) / (count - 1);
        const wheel = cylinder(
          light ? 0.62 : 0.42,
          0.42,
          x,
          light ? 0.65 : 0.67,
          side * (light ? 1.58 : 1.72),
          light ? rubber : edge,
          tank,
          "z",
        );
        wheels.push(wheel);
        cylinder(
          light ? 0.31 : 0.2,
          0.05,
          x,
          light ? 0.65 : 0.67,
          side * (light ? 1.81 : 1.96),
          accent,
          tank,
          "z",
        );
      }
      if (heavy) {
        for (let i = 0; i < 3; i++) {
          block(1.52, 0.68, 0.33, -1.7 + i * 1.65, 1.26, side * 1.62, paint);
          block(0.22, 0.7, 0.35, -1.7 + i * 1.65, 1.26, side * 1.64, edge);
        }
      } else {
        block(3.7, 0.22, 0.46, 0.1, 1.36, side * 1.48, paint);
      }
      block(0.12, 0.3, 0.46, -2.6, 1.36, side * 0.87, ink);
      block(0.14, 0.16, 0.31, -2.67, 1.39, side * 0.87, glow);
      block(0.16, 0.19, 0.34, 2.59, 1.27, side * 0.92, accent);
      block(0.75, 0.12, 0.55, 1.75, 1.81, side * 0.75, rubber);
      for (let i = 0; i < 3; i++)
        block(0.07, 0.04, 0.44, 1.5 + i * 0.22, 1.88, side * 0.75, edge);
    }
    block(0.65, 0.06, 0.5, -1.7, 1.78, 0, accent);
    if (light) {
      // Twin rear thrusters make the scout recognizable even from the chase camera.
      for (const side of [-1, 1]) {
        cylinder(0.31, 0.7, 2.2, 1.25, side * 0.7, ink, tank, "x");
        cylinder(0.23, 0.07, 2.58, 1.25, side * 0.7, glow, tank, "x");
      }
    }
  };
});
