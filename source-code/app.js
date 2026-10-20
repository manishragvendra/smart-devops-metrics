function calculateTotal(price, quantity) {
    return price * quantity;
}

function main() {
    const product = "Laptop";
    const price = 5000000000000;
    const quantity = 22;

    const total = calculateTotal(price, quantity);

    console.log("Product:", product);
    console.log("Price:", price);
    console.log("Quantity:", quantity);
    console.log("Total Amount: ₹" + total);
    console.log("JavaScript program executed successfully!");
}

main();