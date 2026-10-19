const { test } = require("./example");

describe("test function", () => {
  it("returns true", () => {
    expect(test()).toBe(true);
  });
});
