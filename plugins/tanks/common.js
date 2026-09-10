(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.buildTrackedHull = factory();
})(typeof window === "undefined" ? globalThis : window, function () {
  return function ({ block, cylinder, paint, edge, rubber, tank, wheels }) {
    block(5.5, 0.8, 2.7, 0, 1.18, 0);
    block(5.85, 0.17, 3.3, 0, 1.65, 0, edge);
    for (const side of [-1, 1]) {
      block(5.6, 0.82, 0.6, 0, 0.66, side * 1.5, rubber);
      for (let i = 0; i < 7; i++) {
        const w = cylinder(
          0.42,
          0.18,
          -2.05 + i * 0.66,
          0.65,
          side * 1.85,
          edge,
          tank,
          "z",
        );
        wheels.push(w);
        cylinder(
          0.13,
          0.2,
          -2.05 + i * 0.66,
          0.65,
          side * 1.87,
          paint,
          tank,
          "z",
        );
      }
      for (let i = 0; i < 12; i++)
        block(0.16, 0.12, 0.64, -2.5 + i * 0.45, 1.12, side * 1.5, edge);
      block(1.2, 0.04, 0.68, 1.9, 1.77, side * 0.75, rubber);
      for (let i = 0; i < 7; i++)
        block(0.045, 0.06, 0.64, 1.4 + i * 0.15, 1.8, side * 0.75, edge);
    }
  };
});
