/* Shared garden terrain with spread-out tank battle starts. */
(function (root, factory) {
  const node = typeof module === "object" && module.exports;
  const api = factory(node ? require("./folio-map.js") : root.TankFolioMap);
  if (node) module.exports = api;
  else root.TankMap = api;
})(typeof window === "undefined" ? globalThis : window, function (garden) {
  return Object.freeze({
    ...garden,
    id: "folio-garden-pvp-v1",
    spawns: [[37,14],[-105,-105],[-105,91],[84,-105],[-70,-7],[7,105],[-7,-77],[105,70]]
      .map(([x,z]) => ({x,z,floor:0})),
  });
});
