const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getExpectedInstallerName,
  evaluateSigningReadiness,
  validateReleaseArtifacts,
  validateReleaseConfig,
  validateSmokeArtifacts
} = require('../scripts/release-utils');

describe('Release packaging helpers', () => {
  it('distinguishes unsigned smoke builds from cert-required release builds', () => {
    const smoke = evaluateSigningReadiness({});
    assert.strictEqual(smoke.ok, true);
    assert.strictEqual(smoke.required, false);
    assert.strictEqual(smoke.mode, 'smoke');

    const release = evaluateSigningReadiness({}, 'release');
    assert.strictEqual(release.ok, false);
    assert.strictEqual(release.required, true);
    assert.match(release.message, /code signing is required/i);

    const signed = evaluateSigningReadiness({
      CSC_LINK: 'file:///tmp/signing.pfx'
    }, 'release');
    assert.strictEqual(signed.ok, true);
    assert.strictEqual(signed.required, true);
    assert.strictEqual(signed.signingMaterialPresent, true);
  });

  it('validates the draft GitHub release config without requiring secrets', () => {
    const pkg = require('../package.json');
    const result = validateReleaseConfig(pkg);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.publishConfig.provider, 'github');
    assert.strictEqual(result.publishConfig.releaseType, 'draft');
  });

  it('flags non-draft release config as not release-ready', () => {
    const result = validateReleaseConfig({
      version: '1.0.0',
      build: {
        publish: {
          provider: 'github',
          owner: 'staffpass',
          repo: 'ocr-hub',
          releaseType: 'prerelease'
        },
        win: {
          signAndEditExecutable: true
        }
      }
    });

    assert.strictEqual(result.ok, false);
    assert.match(result.issues.join('\n'), /draft/i);
  });

  it('accepts smoke build output and release metadata when they stay in sync', () => {
    const pkg = require('../package.json');
    const installerName = getExpectedInstallerName(pkg);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staffpass-release-'));
    const distDir = path.join(tempDir, 'dist_installer');
    const unpackedDir = path.join(distDir, 'win-unpacked');
    fs.mkdirSync(unpackedDir, { recursive: true });

    const installerPath = path.join(distDir, installerName);
    const latestYml = [
      `version: ${pkg.version}`,
      'files:',
      `  - url: ${installerName}`,
      '    sha512: QnJva2VuU2hhNTAxQ2hlY2tzdW0=',
      '    size: 12345',
      `path: ${installerName}`,
      'sha512: QnJva2VuU2hhNTAxQ2hlY2tzdW0=',
      "releaseDate: '2026-06-07T00:00:00.000Z'",
      ''
    ].join('\n');

    try {
      fs.writeFileSync(installerPath, 'fake installer payload');
      fs.writeFileSync(path.join(distDir, 'latest.yml'), latestYml);

      const smokeResult = validateSmokeArtifacts({ distDir });
      assert.strictEqual(smokeResult.ok, true);
      assert.strictEqual(smokeResult.unpackedPath, unpackedDir);

      const artifactResult = validateReleaseArtifacts({ distDir, pkg });
      assert.strictEqual(artifactResult.ok, true);
      assert.strictEqual(artifactResult.latest.version, pkg.version);
      assert.strictEqual(artifactResult.latest.path, installerName);
      assert.strictEqual(artifactResult.latest.files[0].url, installerName);
      assert.strictEqual(path.basename(artifactResult.installerPath), installerName);
      assert.strictEqual(artifactResult.expectedInstallerName, installerName);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('flags stale updater metadata when latest.yml is behind package.json', () => {
    const pkg = require('../package.json');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staffpass-stale-release-'));
    const distDir = path.join(tempDir, 'dist_installer');
    const staleInstallerName = `${pkg.build.productName} Setup 1.3.0.exe`;
    const latestYml = [
      'version: 1.3.0',
      'files:',
      `  - url: ${staleInstallerName}`,
      '    sha512: JnnbYgvrQcbn4RH6AGPWwXhrK1Q9nA4dIUlpPyCzaVb3i+2PitsRdMvJhxgezw1MMcAfPIxTr2OBJ389JjyYPg==',
      '    size: 80254325',
      `path: ${staleInstallerName}`,
      'sha512: JnnbYgvrQcbn4RH6AGPWwXhrK1Q9nA4dIUlpPyCzaVb3i+2PitsRdMvJhxgezw1MMcAfPIxTr2OBJ389JjyYPg==',
      "releaseDate: '2026-06-05T09:19:24.573Z'",
      ''
    ].join('\n');

    try {
      fs.mkdirSync(distDir, { recursive: true });
      fs.writeFileSync(path.join(distDir, 'latest.yml'), latestYml);

      const result = validateReleaseArtifacts({ distDir, pkg });
      assert.strictEqual(result.ok, false);
      assert.match(result.issues.join('\n'), /Stale updater metadata: latest\.yml version 1\.3\.0 does not match package\.json version 1\.4\.0/i);
      assert.match(result.issues.join('\n'), /Stale updater metadata: latest\.yml path .*1\.3\.0\.exe does not match the expected installer .*1\.4\.0\.exe/i);
      assert.match(result.issues.join('\n'), /Installer referenced by latest\.yml was not found/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports missing release updater metadata clearly', () => {
    const pkg = require('../package.json');
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staffpass-missing-release-'));
    const distDir = path.join(tempDir, 'dist_installer');

    try {
      fs.mkdirSync(distDir, { recursive: true });

      const result = validateReleaseArtifacts({ distDir, pkg });
      assert.strictEqual(result.ok, false);
      assert.strictEqual(result.latest, null);
      assert.match(result.issues.join('\n'), /Release updater metadata was not found/i);
      assert.match(result.issues.join('\n'), /fresh signed release build/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('reports missing smoke output clearly', () => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'staffpass-smoke-'));

    try {
      const result = validateSmokeArtifacts({ distDir: path.join(tempDir, 'dist_installer') });
      assert.strictEqual(result.ok, false);
      assert.match(result.issues.join('\n'), /Smoke build output was not found/i);
    } finally {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });
});
