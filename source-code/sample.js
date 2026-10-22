```javascript
// sample.js
// Sample code for Smart DevOps Metrics analysis

function calculateTotal(numbers) {
    if (!Array.isArray(numbers)) {
        throw new Error("Input must be an array");
    }

    let total = 0;

    for (const number of numbers) {
        if (typeof number !== "number") {
            throw new Error("All values must be numbers");
        }

        total += number;
    }

    return total;
}

function calculateAverage(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
        return 0;
    }

    return calculateTotal(numbers) / numbers.length;
}

function findMaximum(numbers) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
        return null;
    }

    return Math.max(...numbers);
}

function isEven(number) {
    return number % 2 === 0;
}

function greetUser(name) {
    if (!name || typeof name !== "string") {
        return "Hello, Guest!";
    }

    return `Hello, ${name}!`;
}

// Example usage
const values = [10, 20, 30, 40, 50];

console.log("Total:", calculateTotal(values));
console.log("Average:", calculateAverage(values));
console.log("Maximum:", findMaximum(values));
console.log("Is 10 even?", isEven(10));
console.log(greetUser("Developer"));

module.exports = {
    calculateTotal,
    calculateAverage,
    findMaximum,
    isEven,
    greetUser
};
```