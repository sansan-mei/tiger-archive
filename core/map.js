(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.TankMap = api;
})(typeof window === "undefined" ? globalThis : window, function () {
  const MAP = Object.freeze({
    id: "summer-crossfire-v3",
    levels: [
      { id: 0, y: 0, bound: 64 },
      { id: 1, y: 8, bound: 46 },
      { id: 2, y: 16, bound: 46 },
    ],
    obstacles: [
      { id: "g1", floor: 0, x: -17, z: 11, w: 13, d: 8, h: 4 },
      { id: "g2", floor: 0, x: 18, z: 9, w: 11, d: 9, h: 4 },
      { id: "g3", floor: 0, x: 0, z: -12, w: 17, d: 8, h: 4 },
      { id: "g4", floor: 0, x: -47, z: -18, w: 7, d: 16, h: 4 },
      { id: "g5", floor: 0, x: 47, z: -18, w: 7, d: 16, h: 4 },
      { id: "m1", floor: 1, x: -15, z: 0, w: 9, d: 15, h: 4 },
      { id: "m2", floor: 1, x: 15, z: 0, w: 9, d: 15, h: 4 },
      { id: "m3", floor: 1, x: 0, z: 25, w: 10, d: 6, h: 3 },
      { id: "t1", floor: 2, x: 0, z: 0, w: 13, d: 12, h: 4 },
      { id: "t2", floor: 2, x: -21, z: -1, w: 6, d: 10, h: 3 },
      { id: "t3", floor: 2, x: 22, z: 11, w: 7, d: 7, h: 3 },
      { id: "spawn-g0", floor: 0, x: 8, z: 47, w: 4, d: 10, h: 3 },
      { id: "spawn-g1", floor: 0, x: -47, z: -37, w: 12, d: 3, h: 3 },
      { id: "spawn-g2", floor: 0, x: 47, z: -37, w: 12, d: 3, h: 3 },
      { id: "flank-west", floor: 0, x: -23, z: -24, w: 6, d: 9, h: 3 },
      { id: "flank-east", floor: 0, x: 23, z: -24, w: 6, d: 9, h: 3 },
      { id: "spawn-m0", floor: 1, x: -23, z: 29, w: 3, d: 9, h: 3 },
      { id: "spawn-m1", floor: 1, x: 23, z: 29, w: 3, d: 9, h: 3 },
      { id: "spawn-m2", floor: 1, x: 8, z: -33, w: 3, d: 12, h: 3 },
      { id: "spawn-t0", floor: 2, x: -20, z: 29, w: 3, d: 12, h: 3 },
      { id: "spawn-t1", floor: 2, x: 16, z: -34, w: 3, d: 12, h: 3 },
      { id: "overlook-west", floor: 2, x: -8, z: 40, w: 9, d: 2, h: 1.1 },
      { id: "overlook-east", floor: 2, x: 8, z: -40, w: 9, d: 2, h: 1.1 },
    ],
    ramps: [
      {
        id: "west-01",
        width: 12,
        a: { floor: 0, x: -36, z: 30 },
        b: { floor: 1, x: -36, z: 2 },
      },
      {
        id: "east-01",
        width: 12,
        a: { floor: 0, x: 36, z: 30 },
        b: { floor: 1, x: 36, z: 2 },
      },
      {
        id: "west-12",
        width: 12,
        a: { floor: 1, x: -36, z: -30 },
        b: { floor: 2, x: -36, z: -2 },
      },
      {
        id: "east-12",
        width: 12,
        a: { floor: 1, x: 36, z: -30 },
        b: { floor: 2, x: 36, z: -2 },
      },
    ],
    pickups: [
      { id: "repair-0", kind: "repair", floor: 0, x: 0, z: 0 },
      { id: "boost-0", kind: "boost", floor: 0, x: 0, z: -38 },
      { id: "repair-1", kind: "repair", floor: 1, x: 0, z: 0 },
      { id: "boost-1", kind: "boost", floor: 1, x: 0, z: 38 },
      { id: "repair-2", kind: "repair", floor: 2, x: 0, z: 26 },
      { id: "boost-2", kind: "boost", floor: 2, x: 0, z: -26 },
    ],
    spawns: [
      { x: 0, z: 52, floor: 0 },
      { x: -50, z: -48, floor: 0 },
      { x: 50, z: -48, floor: 0 },
      { x: -29, z: 34, floor: 1 },
      { x: 29, z: 34, floor: 1 },
      { x: 0, z: -33, floor: 1 },
      { x: -28, z: 29, floor: 2 },
      { x: 24, z: -34, floor: 2 },
    ],
  });
  return MAP;
});
