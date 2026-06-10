const fs = require('fs');
const path = require('path');

const {
  getFileSha512Base64,
  getLocalInstallerName,
  loadPackageJson,
  readLatestYml
} = require('./release-utils');

function findInstallerByMetadata(distDir, latest) {
  const candidates = fs.readdirSync(distDir)
    .filter((name) => name.toLowerCase().endsWith('.exe'))
    .map((name) => path.join(distDir, name));

  return candidates.find((candidate) => {
    const stats = fs.statSync(candidate);
    return stats.isFile()
      && stats.size === latest.files[0].size
      && getFileSha512Base64(candidate) === latest.sha512;
  });
}

function copyBlockmapIfPresent(sourcePath, updaterAssetPath) {
  const sourceBlockmapPath = `${sourcePath}.blockmap`;
  const updaterBlockmapPath = `${updaterAssetPath}.blockmap`;
  if (fs.existsSync(sourceBlockmapPath)) {
    fs.copyFileSync(sourceBlockmapPath, updaterBlockmapPath);
    return { sourceBlockmapPath, updaterBlockmapPath };
  }

  return { sourceBlockmapPath: null, updaterBlockmapPath };
}

function syncReleaseArtifacts({ distDir = path.join(process.cwd(), 'dist_installer'), pkg = loadPackageJson() } = {}) {
  const { latest, missing, latestPath } = readLatestYml(distDir);
  if (missing || !latest || !latest.path) {
    throw new Error(`Release updater metadata was not found or is incomplete: ${latestPath}`);
  }

  const updaterAssetPath = path.join(distDir, latest.path);
  if (fs.existsSync(updaterAssetPath) && getFileSha512Base64(updaterAssetPath) === latest.sha512) {
    const localInstallerPath = path.join(distDir, getLocalInstallerName(pkg));
    const blockmap = fs.existsSync(localInstallerPath)
      ? copyBlockmapIfPresent(localInstallerPath, updaterAssetPath)
      : { sourceBlockmapPath: null, updaterBlockmapPath: `${updaterAssetPath}.blockmap` };
    return { copied: false, updaterAssetPath, ...blockmap };
  }

  const localInstallerPath = path.join(distDir, getLocalInstallerName(pkg));
  const sourcePath = fs.existsSync(localInstallerPath)
    && getFileSha512Base64(localInstallerPath) === latest.sha512
    ? localInstallerPath
    : findInstallerByMetadata(distDir, latest);

  if (!sourcePath) {
    throw new Error(`No installer in ${distDir} matches latest.yml size and sha512 metadata.`);
  }

  fs.copyFileSync(sourcePath, updaterAssetPath);
  return { copied: true, sourcePath, updaterAssetPath, ...copyBlockmapIfPresent(sourcePath, updaterAssetPath) };
}

function main() {
  try {
    const result = syncReleaseArtifacts();
    if (result.copied) {
      console.log(`release-artifacts: copied ${path.basename(result.sourcePath)} -> ${path.basename(result.updaterAssetPath)}`);
      if (result.sourceBlockmapPath && fs.existsSync(result.sourceBlockmapPath)) {
        console.log(`release-artifacts: copied ${path.basename(result.sourceBlockmapPath)} -> ${path.basename(result.updaterBlockmapPath)}`);
      }
    } else {
      console.log(`release-artifacts: ${path.basename(result.updaterAssetPath)} already in sync`);
      if (result.sourceBlockmapPath && fs.existsSync(result.sourceBlockmapPath)) {
        console.log(`release-artifacts: synced ${path.basename(result.updaterBlockmapPath)}`);
      }
    }
  } catch (error) {
    console.error(`release-artifacts: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  copyBlockmapIfPresent,
  findInstallerByMetadata,
  syncReleaseArtifacts
};
