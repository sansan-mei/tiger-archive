// Node and browser share the same trusted plugin inventory.
const registry = require("./registry.js");
for (const file of require("../app-manifest.js").plugins) require("../" + file);
registry.seal();
module.exports = registry;
