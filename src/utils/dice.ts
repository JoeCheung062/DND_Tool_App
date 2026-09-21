/**
 * Simple NdX[+/-Y] dice roller for Socket.IO events.
 */
export function rollDice(expression: string) {
  const match = expression.trim().match(/^(\d+)?d(4|6|8|10|12|20|100)([+-]\d+)?$/i);
  if (!match) {
    throw new Error("Invalid dice expression");
  }

  const count = Number(match[1] ?? 1);
  const sides = Number(match[2]);
  const modifier = Number(match[3] ?? 0);

  if (count < 1 || count > 100) {
    throw new Error("Dice count must be between 1 and 100");
  }

  const rolls: number[] = [];
  for (let i = 0; i < count; i += 1) {
    rolls.push(1 + Math.floor(Math.random() * sides));
  }

  const subtotal = rolls.reduce((a, b) => a + b, 0);
  const total = subtotal + modifier;

  return {
    expression: expression.trim(),
    count,
    sides,
    modifier,
    rolls,
    subtotal,
    total,
  };
}
