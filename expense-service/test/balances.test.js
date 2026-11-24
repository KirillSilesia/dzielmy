const { computeBalances, settle } = require('../src/balances');

test('wydatek dzieli się po równo, a płacący dostaje zwrot', () => {
  const balances = computeBalances([1, 2, 3], [{ amountCents: 9000, paidBy: 1 }]);
  expect(balances).toEqual({ 1: 6000, 2: -3000, 3: -3000 });
});

test('suma sald zawsze wynosi zero, także przy kwotach niepodzielnych', () => {
  const balances = computeBalances([1, 2, 3], [
    { amountCents: 1000, paidBy: 2 },
    { amountCents: 101, paidBy: 3 },
  ]);
  expect(Object.values(balances).reduce((a, b) => a + b, 0)).toBe(0);
  expect(balances).toEqual({ 1: -368, 2: 633, 3: -265 });
});

test('brak wydatków daje zerowe salda i brak przelewów', () => {
  const balances = computeBalances([1, 2], []);
  expect(balances).toEqual({ 1: 0, 2: 0 });
  expect(settle(balances)).toEqual([]);
});

test('settle zwraca przelewy, które zerują wszystkie salda', () => {
  const balances = { 1: 6000, 2: -3000, 3: -3000 };
  const transfers = settle(balances);
  expect(transfers).toEqual([
    { from: 2, to: 1, amountCents: 3000 },
    { from: 3, to: 1, amountCents: 3000 },
  ]);
  const after = { ...balances };
  for (const t of transfers) {
    after[t.from] += t.amountCents;
    after[t.to] -= t.amountCents;
  }
  expect(Object.values(after).every((v) => v === 0)).toBe(true);
});
