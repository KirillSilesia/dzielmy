// Czysta logika rozliczeń – kwoty w groszach (liczby całkowite), żeby uniknąć błędów zaokrągleń.

// Zwraca saldo każdego członka: dodatnie = inni są mu winni, ujemne = on jest winien.
function computeBalances(memberIds, expenses) {
  const balances = Object.fromEntries(memberIds.map((id) => [id, 0]));
  if (memberIds.length === 0) return balances;
  const sorted = [...memberIds].sort((a, b) => a - b);
  for (const e of expenses) {
    const base = Math.floor(e.amountCents / sorted.length);
    const remainder = e.amountCents - base * sorted.length;
    // Reszta z dzielenia (pojedyncze grosze) trafia do pierwszych osób, żeby suma się zgadzała.
    sorted.forEach((id, i) => {
      balances[id] -= base + (i < remainder ? 1 : 0);
    });
    if (e.paidBy in balances) balances[e.paidBy] += e.amountCents;
  }
  return balances;
}

// Zamienia salda na listę przelewów "kto komu ile".
function settle(balances) {
  const debtors = [];
  const creditors = [];
  for (const [id, value] of Object.entries(balances)) {
    if (value < 0) debtors.push({ id: Number(id), amount: -value });
    if (value > 0) creditors.push({ id: Number(id), amount: value });
  }
  const transfers = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const amount = Math.min(debtors[d].amount, creditors[c].amount);
    transfers.push({ from: debtors[d].id, to: creditors[c].id, amountCents: amount });
    debtors[d].amount -= amount;
    creditors[c].amount -= amount;
    if (debtors[d].amount === 0) d++;
    if (creditors[c].amount === 0) c++;
  }
  return transfers;
}

module.exports = { computeBalances, settle };
