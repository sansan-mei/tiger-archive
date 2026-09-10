/* Explicit release command only. Importing this module never creates output. */
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const manifest = require("../app-manifest.js");
const ROOT = path.resolve(__dirname, "..");
const files = Object.freeze([
  ...new Set([
    "index.html",
    "battle.html",
    "battle.css",
    "app-manifest.js",
    "client/bootstrap.js",
    ...manifest.scripts,
    ...manifest.assets,
  ]),
]);
function optionsFor(file) {
  return {
    target: "browser-no-eval",
    compact: true,
    sourceMap: false,
    identifierNamesGenerator: "hexadecimal",
    identifiersPrefix:
      "t" + crypto.createHash("sha256").update(file).digest("hex").slice(0, 12),
    renameGlobals: false,
    renameProperties: false,
    controlFlowFlattening: false,
    deadCodeInjection: false,
    debugProtection: false,
    debugProtectionInterval: 0,
    selfDefending: false,
    disableConsoleOutput: false,
    numbersToExpressions: false,
    splitStrings: false,
    stringArray: true,
    stringArrayThreshold: 0.65,
    stringArrayEncoding: [],
    stringArrayCallsTransform: false,
    stringArrayWrappersCount: 1,
    stringArrayWrappersType: "variable",
    stringArrayRotate: false,
    transformObjectKeys: false,
    unicodeEscapeSequence: false,
    seed: 314159,
    log: false,
  };
}
function shouldObfuscate(file) {
  return file.endsWith(".js") && !file.startsWith("vendor/");
}
function transform(source, file) {
  return require("javascript-obfuscator")
    .obfuscate(source, optionsFor(file))
    .getObfuscatedCode();
}
function release({ obfuscate = true } = {}) {
  const output = path.join(ROOT, "public-dist");
  if (fs.existsSync(output))
    throw new Error(
      "public-dist already exists; move or remove the old release before generating a new one",
    );
  const staging = fs.mkdtempSync(path.join(ROOT, ".client-release-"));
  try {
    for (const file of files) {
      const input =
        file === "vendor/three.min.js"
          ? "node_modules/three/build/three.min.js"
          : file;
      let source = fs.readFileSync(path.join(ROOT, input));
      if (obfuscate && shouldObfuscate(file))
        source = transform(source.toString("utf8"), file);
      const destination = path.join(staging, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.writeFileSync(destination, source);
    }
    fs.renameSync(staging, output);
  } catch (error) {
    fs.rmSync(staging, { recursive: true, force: true });
    throw error;
  }
  console.log(
    `Client release: ${files.length} files in public-dist (${obfuscate ? "obfuscated" : "readable debug output"})`,
  );
}
if (require.main === module) {
  const value = process.env.OBFUSCATE_CLIENT ?? "true";
  if (!["true", "false"].includes(value))
    throw new Error("OBFUSCATE_CLIENT must be true or false");
  release({ obfuscate: value === "true" });
}
module.exports = { files, optionsFor, shouldObfuscate, transform };
