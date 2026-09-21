import { rollDice } from "./dice.js";

const cases = ["d20", "2d6+3", "1d8-1", "4d4"];

for (const expression of cases) {
  const result = rollDice(expression);
  console.log(expression, "=>", result.rolls, "total", result.total);
}

try {
  rollDice("not-dice");
  throw new Error("expected invalid expression to throw");
} catch (err) {
  if (err instanceof Error && err.message === "Invalid dice expression") {
    console.log("invalid expression rejected OK");
  } else {
    throw err;
  }
}

console.log("dice.selftest passed");
