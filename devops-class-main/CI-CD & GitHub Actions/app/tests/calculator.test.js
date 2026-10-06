const { test, describe } = require('node:test');
const assert = require('node:assert');
const { add, subtract, multiply, divide, modulo } = require('../src/calculator');

describe('calculator', () => {
  test('add returns the sum', () => {
    assert.strictEqual(add(2, 3), 5);
    assert.strictEqual(add(-1, 1), 0);
  });

  test('subtract returns the difference', () => {
    assert.strictEqual(subtract(10, 4), 6);
  });

  test('multiply returns the product', () => {
    assert.strictEqual(multiply(6, 7), 42);
  });

  test('divide returns the quotient', () => {
    assert.strictEqual(divide(10, 2), 5);
  });

  test('divide by zero throws', () => {
    assert.throws(() => divide(1, 0), /Division by zero/);
  });

  test('modulo returns the remainder', () => {
    assert.strictEqual(modulo(10, 3), 1);
    assert.strictEqual(modulo(9, 3), 0);
  });

  test('modulo by zero throws', () => {
    assert.throws(() => modulo(1, 0), /Modulo by zero/);
  });
});
