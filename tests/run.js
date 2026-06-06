const fs = require('fs');
const path = require('path');

const testQueue = [];
let currentSuite = null;

global.describe = function(name, fn) {
  const suite = {
    name,
    befores: [],
    afters: [],
    beforeEaches: [],
    afterEaches: [],
    tests: []
  };

  const parentSuite = currentSuite;
  currentSuite = suite;
  fn();
  currentSuite = parentSuite;

  testQueue.push(suite);
};

global.before = function(fn) {
  if (currentSuite) currentSuite.befores.push(fn);
};

global.after = function(fn) {
  if (currentSuite) currentSuite.afters.push(fn);
};

global.beforeEach = function(fn) {
  if (currentSuite) currentSuite.beforeEaches.push(fn);
};

global.afterEach = function(fn) {
  if (currentSuite) currentSuite.afterEaches.push(fn);
};

global.it = function(name, fn) {
  if (currentSuite) {
    currentSuite.tests.push({ name, fn });
  }
};

const testsDir = __dirname;
const runTests = async () => {
  const files = fs.readdirSync(testsDir).filter(f => f.endsWith('.test.js') && f !== 'run.js');
  
  // Load files to populate testQueue
  for (const file of files) {
    console.log(`Loading test file: ${file}`);
    require(path.join(testsDir, file));
  }

  // Execute testQueue sequentially
  for (const suite of testQueue) {
    console.log(`\n${suite.name}`);
    
    // Run befores
    for (const beforeFn of suite.befores) {
      await beforeFn();
    }

    // Run tests
    for (const test of suite.tests) {
      // Run beforeEach
      for (const beforeEachFn of suite.beforeEaches) {
        await beforeEachFn();
      }

      try {
        await test.fn();
        console.log(`  ✓ ${test.name}`);
      } catch (err) {
        console.error(`  ✗ ${test.name}`);
        console.error(err);
        process.exitCode = 1;
      }

      // Run afterEach
      for (const afterEachFn of suite.afterEaches) {
        await afterEachFn();
      }
    }

    // Run afters
    for (const afterFn of suite.afters) {
      await afterFn();
    }
  }
  process.exit(process.exitCode || 0);
};

runTests().catch(err => {
  console.error(err);
  process.exit(1);
});

