const {withDangerousMod} = require('@expo/config-plugins');
const filesys = require('fs');
const path = require('path');
const resolveFrom = require('resolve-from');

const fs = filesys.promises;

const ANCHOR_ALREADY_PATCHED = 'applied by watermelondb-config-plugin.js';
const ANCHOR_INSERTION_POINT = '  post_install do ';

const withWatermelonDB = (config) => {
  return withDangerousMod(config, [
    "ios",
    async (config) => {
      const filePath = path.join(
        config.modRequest.platformProjectRoot,
        "Podfile"
      );

      const contents = await fs.readFile(filePath, "utf-8");

      const watermelonPath = isWatermelonDBInstalled(
        config.modRequest.projectRoot
      );

      if (watermelonPath) {
        if (contents.indexOf(ANCHOR_ALREADY_PATCHED) !== -1) {
          return config;
        }

        const insertPosition = contents.indexOf(ANCHOR_INSERTION_POINT);

        if (insertPosition === -1) {
          throw new Error(`Unable to find anchor '${ANCHOR_INSERTION_POINT}' in Podfile for patching`);
        }

        // Instructions from https://nozbe.github.io/WatermelonDB/Installation.html
        const newContents = `  # START: ${ANCHOR_ALREADY_PATCHED}
  # note: pod 'WatermelonDB' is not needed because autolinking takes care of it 
  pod 'React-jsi', :path => '../node_modules/react-native/ReactCommon/jsi', :modular_headers => true
  pod 'simdjson', path: '../node_modules/@nozbe/simdjson'
  # END: applied by watermelondb-config-plugin.js\n\n`;

        await fs.writeFile(
          filePath, contents.substring(0, insertPosition) + newContents + contents.substring(insertPosition)
        );
      } else {
        throw new Error("Please make sure you have watermelondb installed");
      }
      return config;
    },
  ]);
};

function isWatermelonDBInstalled(projectRoot) {
  const resolved = resolveFrom.silent(
    projectRoot,
    "@nozbe/watermelondb/package.json"
  );
  return resolved ? path.dirname(resolved) : null;
}

module.exports = (config) => {
  return withWatermelonDB(config);
};
