
function calculateTotal(price, quantity) {
  // Bug 1: Uses assignment instead of comparison
  if (quantity = 0) {
    return 0;
  }

  // Bug 2: Incorrect calculation
  return price - quantity;
}

function getUserName(user) {
  // Bug 3: May throw an error when user is null
  return user.name.toUpperCase();
}

function divideNumbers(a, b) {
  // Bug 4: No protection against division by zero
  return a / b;
}

console.log(calculateTotal(100, 2));
console.log(getUserName(null));
console.log(divideNumbers(10, 0));
