const fs = require("fs");
const path = require("path");
const {
  createRunOncePlugin,
  withDangerousMod,
} = require("expo/config-plugins");

const pluginName = "mtgscan-catalog-recognizer-sources";
const pluginVersion = "1.0.0";
const sourceDirectory = path.join(
  __dirname,
  "..",
  "..",
  "catalog-recognizer",
  "native",
);
const targetDirectory = path.join(
  __dirname,
  "..",
  "modules",
  "mtg-catalog-recognizer",
  "ios",
  "shared",
);

function copyCatalogRecognizerSources() {
  fs.rmSync(targetDirectory, { recursive: true, force: true });
  fs.mkdirSync(targetDirectory, { recursive: true });
  for (const name of fs.readdirSync(sourceDirectory)) {
    if (name.endsWith(".swift"))
      fs.copyFileSync(
        path.join(sourceDirectory, name),
        path.join(targetDirectory, name),
      );
  }
}

function withCatalogRecognizerSources(config) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      copyCatalogRecognizerSources();
      return modConfig;
    },
  ]);
}

module.exports = createRunOncePlugin(
  withCatalogRecognizerSources,
  pluginName,
  pluginVersion,
);
module.exports.copyCatalogRecognizerSources = copyCatalogRecognizerSources;
