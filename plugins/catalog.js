// Trusted allowlist for Node; keep index.html's browser list in sync.
const registry=require('./registry.js');
require('./tanks/light.js');
require('./tanks/medium.js');
require('./tanks/heavy.js');
require('./tanks/human.js');
require('./weapons/standard.js');
require('./weapons/rapid.js');
require('./weapons/laser.js');
require('./weapons/rocket.js');
registry.seal();
module.exports=registry;
