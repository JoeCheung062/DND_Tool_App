const { cp } = require("node:fs/promises");
const path = require("node:path");

module.exports = async function afterPack(context) {
  const resources =
    context.electronPlatformName === "darwin"
      ? path.join(
          context.appOutDir,
          `${context.packager.appInfo.productFilename}.app`,
          "Contents",
          "Resources"
        )
      : path.join(context.appOutDir, "resources");
  const source = path.join(context.packager.projectDir, "bundle", "node_modules");
  const destination = path.join(resources, "bundle", "node_modules");
  await cp(source, destination, {
    recursive: true,
    filter: (from) => !from.includes(`${path.sep}.cache${path.sep}`),
  });
  console.log(`Copied server node_modules into ${destination}`);
};
