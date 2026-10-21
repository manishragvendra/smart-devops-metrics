
module.exports = {
  testEnvironment: "node",
  rootDir: "../source-code",
  testRegex: ".*\\.test\\.js$",

  collectCoverage: true,

  // Include all JavaScript source files automatically.
  collectCoverageFrom: [
    "**/*.js",
    "!**/*.test.js",
    "!**/node_modules/**"
  ],

  coverageProvider: "v8",
  coverageReporters: ["text", "lcov"],
  coverageDirectory: "../coverage-source"
};
