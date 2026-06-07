const {
  evaluateSigningReadiness,
  loadPackageJson,
  validateReleaseArtifacts,
  validateReleaseConfig,
  validateSmokeArtifacts
} = require('./release-utils');

function parseArgs(argv) {
  const result = {
    mode: 'release',
    distDir: 'dist_installer'
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--mode' && argv[index + 1]) {
      result.mode = String(argv[index + 1]).trim().toLowerCase();
      index += 1;
      continue;
    }

    if (arg === '--dist-dir' && argv[index + 1]) {
      result.distDir = argv[index + 1];
      index += 1;
    }
  }

  return result;
}

function emitResult(label, result) {
  if (result.ok) {
    console.log(`${label}: ok`);
    return;
  }

  for (const issue of result.issues || []) {
    console.error(`${label}: ${issue}`);
  }
  process.exitCode = 1;
}

function main() {
  const { mode, distDir } = parseArgs(process.argv.slice(2));
  const pkg = loadPackageJson();

  try {
    if (mode === 'config') {
      const configResult = validateReleaseConfig(pkg);
      emitResult('release-config', configResult);
      return;
    }

    if (mode === 'smoke') {
      const smokeResult = validateSmokeArtifacts({ distDir });
      emitResult('smoke-artifacts', smokeResult);
      return;
    }

    if (mode === 'release') {
      const signingResult = evaluateSigningReadiness(process.env, 'release');
      emitResult('signing', signingResult);

      const configResult = validateReleaseConfig(pkg);
      emitResult('release-config', configResult);

      const artifactResult = validateReleaseArtifacts({ distDir, pkg });
      emitResult('release-artifacts', artifactResult);
      return;
    }

    console.error(`Unknown validation mode: ${mode}`);
    process.exitCode = 1;
  } catch (error) {
    console.error(`release-validation: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  main,
  parseArgs
};
