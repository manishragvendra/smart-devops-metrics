
describe("Backend basic validation tests", () => {
  test("addition produces the correct result", () => {
    expect(2 + 3).toBe(5);
  });

  test("project name is a non-empty string", () => {
    const projectName = "Smart DevOps Metrics";
    expect(typeof projectName).toBe("string");
    expect(projectName.length).toBeGreaterThan(0);
  });

  test("failure rate is calculated correctly", () => {
    const totalBuilds = 17;
    const failedBuilds = 7;
    const failureRate = (failedBuilds / totalBuilds) * 100;

    expect(failureRate).toBeCloseTo(41.1765, 3);
  });
});
