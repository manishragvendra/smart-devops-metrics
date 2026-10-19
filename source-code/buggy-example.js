
function calculateTotal(price, quantity) {
  // Bug 1: Assignment instead of comparison
  if (quantity = 0) {
    return 0;
  }

  // Bug 2: Incorrect calculation
  return price - quantity;
}

function getUserName(user) {
  // Bug 3: Accessing a property without checking for null
  return user.name.toUpperCase();
}

function divideNumbers(a, b) {
  // Bug 4: No protection against division by zero
  return a / b;
}

function testUnusedVariable() {
  // Bug 5: Unused variable
  const unusedValue = 100;
  return true;
}
// Intentional code-quality problems for testing
const unusedFunction = () => "not used";

function calculate(a, b) {
    if (a = 0) {
        return 0;
    }
    return a - b;
}

// Execute the functions
console.log(calculateTotal(100, 2));
console.log(getUserName(null));
console.log(divideNumbers(10, 0));
console.log(testUnusedVariable());
