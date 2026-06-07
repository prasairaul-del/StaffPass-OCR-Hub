const fs = require('fs');
const path = require('path');

const SIGNING_ENV_KEYS = [
  'CSC_LINK',
  'WIN_CSC_LINK',
  'CSC_NAME',
  'WIN_CSC_NAME'
];

function hasSigningMaterial(env = process.env) {
  return SIGNING_ENV_KEYS.some((key) => {
    const value = env[key];
    return typeof value === 'string' && value.trim().length > 0;
  });
}

function resolveBuildMode(env = process.env, explicitMode) {
  const value = explicitMode || env.STAFFPASS_BUILD_MODE || '';
  if (value) {
    return String(value).trim().toLowerCase();
  }

  if (env.STAFFPASS_REQUIRE_SIGNING === '1') {
    return 'release';
  }

  return 'smoke';
}

function evaluateSigningReadiness(env = process.env, explicitMode) {
  const mode = resolveBuildMode(env, explicitMode);
  const signingMaterialPresent = hasSigningMaterial(env);

  if (mode !== 'release') {
    return {
      ok: true,
      mode,
      required: false,
      signingMaterialPresent
    };
  }

  if (!signingMaterialPresent) {
    return {
      ok: false,
      mode,
      required: true,
      signingMaterialPresent,
      message: 'Windows code signing is required for production release builds. Set CSC_LINK/WIN_CSC_LINK or CSC_NAME/WIN_CSC_NAME before running the release build.'
    };
  }

  return {
    ok: true,
    mode,
    required: true,
    signingMaterialPresent
  };
}

function loadPackageJson(baseDir = process.cwd()) {
  const packagePath = path.join(baseDir, 'package.json');
  return JSON.parse(fs.readFileSync(packagePath, 'utf8'));
}

function getProductName(pkg = loadPackageJson()) {
  const build = pkg.build || {};
  return build.productName || pkg.productName || pkg.name || 'application';
}

function getExpectedInstallerName(pkg = loadPackageJson()) {
  return `${getProductName(pkg)} Setup ${pkg.version}.exe`;
}

function stripQuotes(value) {
  const trimmed = String(value).trim();
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseLatestYml(contents) {
  const latest = { files: [] };
  let currentFile = null;

  for (const rawLine of contents.split(/\r?\n/)) {
    if (!rawLine.trim()) {
      continue;
    }

    if (rawLine.startsWith('version:')) {
      latest.version = stripQuotes(rawLine.slice('version:'.length));
      continue;
    }

    if (rawLine.startsWith('path:')) {
      latest.path = stripQuotes(rawLine.slice('path:'.length));
      continue;
    }

    if (rawLine.startsWith('sha512:')) {
      latest.sha512 = stripQuotes(rawLine.slice('sha512:'.length));
      continue;
    }

    if (rawLine.startsWith('releaseDate:')) {
      latest.releaseDate = stripQuotes(rawLine.slice('releaseDate:'.length));
      continue;
    }

    if (/^\s+-\s+url:/.test(rawLine)) {
      currentFile = {
        url: stripQuotes(rawLine.split('url:')[1])
      };
      latest.files.push(currentFile);
      continue;
    }

    if (/^\s+sha512:/.test(rawLine) && currentFile) {
      currentFile.sha512 = stripQuotes(rawLine.split('sha512:')[1]);
      continue;
    }

    if (/^\s+size:/.test(rawLine) && currentFile) {
      const sizeValue = Number(stripQuotes(rawLine.split('size:')[1]));
      currentFile.size = Number.isFinite(sizeValue) ? sizeValue : rawLine.split('size:')[1].trim();
    }
  }

  return latest;
}

function readLatestYml(distDir = path.join(process.cwd(), 'dist_installer')) {
  const latestPath = path.join(distDir, 'latest.yml');
  if (!fs.existsSync(latestPath)) {
    return {
      latestPath,
      distDir,
      latest: null,
      missing: true
    };
  }

  const contents = fs.readFileSync(latestPath, 'utf8');
  return {
    latestPath,
    distDir,
    latest: parseLatestYml(contents)
  };
}

function validateReleaseConfig(pkg = loadPackageJson()) {
  const build = pkg.build || {};
  const publishConfig = Array.isArray(build.publish) ? build.publish[0] : build.publish;
  const issues = [];

  if (!publishConfig || typeof publishConfig !== 'object') {
    issues.push('package.json build.publish must declare the GitHub release target.');
  } else {
    if (publishConfig.provider !== 'github') {
      issues.push('package.json build.publish must use the GitHub provider.');
    }

    if (!publishConfig.owner || !publishConfig.repo) {
      issues.push('package.json build.publish must include both owner and repo.');
    }

    if ((publishConfig.releaseType || 'draft') !== 'draft') {
      issues.push('package.json build.publish.releaseType should stay set to draft for release readiness.');
    }
  }

  if (!build.win || build.win.signAndEditExecutable !== true) {
    issues.push('package.json build.win.signAndEditExecutable should remain enabled for Windows release packaging.');
  }

  return {
    ok: issues.length === 0,
    issues,
    publishConfig: publishConfig || null,
    packageVersion: pkg.version
  };
}

function validateReleaseArtifacts({ distDir = path.join(process.cwd(), 'dist_installer'), pkg = loadPackageJson() } = {}) {
  const { latestPath, latest, missing } = readLatestYml(distDir);
  const issues = [];
  const expectedInstallerName = getExpectedInstallerName(pkg);

  if (missing) {
    return {
      ok: false,
      issues: [`Release updater metadata was not found: ${latestPath}. Run a fresh signed release build to generate latest.yml before publishing.`],
      latestPath,
      installerPath: null,
      latest: null,
      packageVersion: pkg.version,
      expectedInstallerName
    };
  }

  if (!latest.version) {
    issues.push('latest.yml is missing a version field.');
  } else if (latest.version !== pkg.version) {
    issues.push(`Stale updater metadata: latest.yml version ${latest.version} does not match package.json version ${pkg.version}. Regenerate dist_installer/latest.yml before publishing.`);
  }

  if (!latest.path) {
    issues.push('latest.yml is missing the installer path.');
  } else if (latest.path !== expectedInstallerName) {
    issues.push(`Stale updater metadata: latest.yml path ${latest.path} does not match the expected installer ${expectedInstallerName}.`);
  }

  if (!latest.sha512) {
    issues.push('latest.yml is missing the top-level sha512 checksum.');
  }

  if (!latest.releaseDate) {
    issues.push('latest.yml is missing the releaseDate field.');
  } else if (Number.isNaN(Date.parse(latest.releaseDate))) {
    issues.push(`latest.yml releaseDate is not a valid ISO timestamp: ${latest.releaseDate}.`);
  }

  if (!latest.files.length) {
    issues.push('latest.yml must include at least one file entry.');
  } else {
    const firstFile = latest.files[0];
    if (!firstFile.url) {
      issues.push('latest.yml file entry is missing a url.');
    } else if (latest.path && firstFile.url !== latest.path) {
      issues.push(`latest.yml file url ${firstFile.url} does not match path ${latest.path}.`);
    }

    if (!firstFile.sha512) {
      issues.push('latest.yml file entry is missing a sha512 checksum.');
    }
  }

  const installerPath = latest.path ? path.join(distDir, latest.path) : null;
  if (installerPath && !fs.existsSync(installerPath)) {
    issues.push(`Installer referenced by latest.yml was not found: ${installerPath}.`);
  } else if (installerPath) {
    const stats = fs.statSync(installerPath);
    if (!stats.isFile() || stats.size <= 0) {
      issues.push(`Installer referenced by latest.yml is empty or not a file: ${installerPath}.`);
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    latestPath,
    installerPath,
    latest,
    packageVersion: pkg.version,
    expectedInstallerName
  };
}

function validateSmokeArtifacts({ distDir = path.join(process.cwd(), 'dist_installer') } = {}) {
  const unpackedPath = path.join(distDir, 'win-unpacked');
  if (!fs.existsSync(unpackedPath)) {
    return {
      ok: false,
      issues: [`Smoke build output was not found: ${unpackedPath}.`],
      unpackedPath
    };
  }

  return {
    ok: true,
    issues: [],
    unpackedPath
  };
}

module.exports = {
  evaluateSigningReadiness,
  hasSigningMaterial,
  loadPackageJson,
  parseLatestYml,
  readLatestYml,
  resolveBuildMode,
  validateReleaseArtifacts,
  validateReleaseConfig,
  getExpectedInstallerName,
  getProductName,
  validateSmokeArtifacts
};
