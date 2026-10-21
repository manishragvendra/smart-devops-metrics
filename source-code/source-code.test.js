
const app = require("./app");
const example = require("./example");

describe("Source Code Metrics Tests", () => {
    test("app.js calculates total correctly", () => {
        expect(app.calculateTotal(500000, 21)).toBe(10500000);
    });

    test("example.js calculates total correctly", () => {
        expect(example.calculateTotal(500000, 21)).toBe(10500000);
    });

    test("zero quantity returns zero", () => {
        expect(app.calculateTotal(500, 0)).toBe(0);
    });

    test("decimal prices work correctly", () => {
        expect(example.calculateTotal(12.5, 4)).toBe(50);
    });
});

