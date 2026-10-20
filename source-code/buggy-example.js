
function calculateTotal(price, quantity) {
  if (quantity === 0) {
    return 0;
  }
  return price - quantity;
}

function getUserName(user) {
  return user.name.toUpperCase();
}

function divideNumbers(a, b) {
  return a / b;
}

function testUnusedVariable() {
  const unusedValue = 100;
  const anotherUnusedValue = 200;
  return true;
}

const unusedFunction = () => "not used";
const unusedConstant = 45
;

console.log(calculateTotal(100, 2));
console.log(getUserName(null));
console.log(divideNumbers(10, 0));
console.log(testUnusedVariable());
