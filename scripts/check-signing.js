const { evaluateSigningReadiness } = require('./release-utils');

const result = evaluateSigningReadiness(process.env, 'release');

if (!result.ok) {
  console.error(result.message);
  process.exit(1);
}
