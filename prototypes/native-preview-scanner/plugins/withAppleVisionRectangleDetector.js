const fs = require("fs");
const path = require("path");
const {
  IOSConfig,
  createRunOncePlugin,
  withXcodeProject,
} = require("expo/config-plugins");

const pluginName = "mtgscan-apple-vision-rectangle-detector";
const pluginVersion = "1.1.0";
const sourceNames = [
  "MTGCardQuadGeometry.swift",
  "MTGCardEdgeRefiner.swift",
  "MTGCardQuadDetector.swift",
  "MTGCardRectangleFrameProcessorPlugin.swift",
  "MTGCardRectangleFrameProcessorPlugin.m",
];

function withAppleVisionRectangleDetector(config) {
  for (const sourceName of sourceNames) {
    const sourcePath = path.join(__dirname, "..", "native", "ios", sourceName);
    config = IOSConfig.XcodeProjectFile.withBuildSourceFile(config, {
      filePath: sourceName,
      contents: fs.readFileSync(sourcePath, "utf8"),
      overwrite: true,
    });
  }

  return withXcodeProject(config, (modConfig) => {
    const projectName = IOSConfig.XcodeUtils.getProjectName(
      modConfig.modRequest.projectRoot,
    );
    IOSConfig.XcodeUtils.addFramework({
      project: modConfig.modResults,
      projectName,
      framework: "Vision.framework",
    });
    const developmentTeam = process.env.MTGSCAN_APPLE_TEAM_ID;
    if (developmentTeam) {
      modConfig.modResults.updateBuildProperty(
        "DEVELOPMENT_TEAM",
        developmentTeam,
        null,
        projectName,
      );
      modConfig.modResults.updateBuildProperty(
        "CODE_SIGN_STYLE",
        "Automatic",
        null,
        projectName,
      );
    }
    modConfig.modResults.updateBuildProperty(
      "SWIFT_OPTIMIZATION_LEVEL",
      '"-O"',
      "Debug",
      projectName,
    );
    return modConfig;
  });
}

module.exports = createRunOncePlugin(
  withAppleVisionRectangleDetector,
  pluginName,
  pluginVersion,
);
