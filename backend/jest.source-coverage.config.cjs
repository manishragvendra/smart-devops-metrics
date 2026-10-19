module.exports = {
  testEnvironment: "node",
  rootDir: "../source-code",
  testRegex: ".*\\.test\\.js$",
  collectCoverage: true,
  collectCoverageFrom: ["example.js"],
  coverageProvider: "v8",
  coverageReporters: ["text", "lcov"],
  coverageDirectory: "../coverage-source"
};
