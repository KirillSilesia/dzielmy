const express = require('express');
const { computeBalances, settle } = require('./balances');

function createApp({ store, authClient }) {
  const app = express();
  app.use(express.json());

  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);
  const toId = (value) => (/^\d+$/.test(String(value)) ? Number(value) : null);

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'expense-service' }));

  // Wszystko poniżej wymaga tokenu, który weryfikuje auth-service.
  app.use(wrap(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Brak tokenu' });
    let user;
    try {
      user = await authClient.verify(token);
    } catch {
      return res.status(503).json({ error: 'Usługa uwierzytelniania jest niedostępna' });
    }
    if (!user) return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
    req.user = user;
    req.token = token;
    next();
  }));

  // Wczytuje grupę i sprawdza, czy zalogowany użytkownik do niej należy.
  const loadGroup = (param = 'groupId') => wrap(async (req, res, next) => {
    const id = toId(req.params[param]);
    const group = id && (await store.getGroup(id));
    // Brak grupy i brak dostępu dają tę samą odpowiedź, żeby nie zdradzać, jakie grupy istnieją.
    if (!group || !group.members.some((m) => m.userId === req.user.id)) {
      return res.status(404).json({ error: 'Nie znaleziono grupy' });
    }
    req.group = group;
    next();
  });

  const ownerOnly = (req, res, next) => {
    if (req.group.ownerId !== req.user.id) {
      return res.status(403).json({ error: 'Tę operację może wykonać tylko właściciel grupy' });
    }
    next();
  };

  const validName = (name) => typeof name === 'string' && name.trim().length > 0;

  function parseExpense(body, group) {
    const { description, amountCents, paidBy } = body || {};
    if (!validName(description)) return { error: 'Opis jest wymagany' };
    if (!Number.isInteger(amountCents) || amountCents <= 0 || amountCents > 2_000_000_000) {
      return { error: 'Kwota (w groszach) musi być dodatnią liczbą całkowitą' };
    }
    if (!group.members.some((m) => m.userId === paidBy)) {
      return { error: 'Płacący musi być członkiem grupy' };
    }
    return { value: { description: description.trim(), amountCents, paidBy } };
  }

  // ----- grupy -----
  app.post('/groups', wrap(async (req, res) => {
    if (!validName(req.body?.name)) return res.status(400).json({ error: 'Nazwa grupy jest wymagana' });
    const group = await store.createGroup({ name: req.body.name.trim(), owner: req.user });
    res.status(201).json(group);
  }));

  app.get('/groups', wrap(async (req, res) => {
    res.json(await store.listGroupsForUser(req.user.id));
  }));

  app.get('/groups/:groupId', loadGroup(), (req, res) => res.json(req.group));

  app.put('/groups/:groupId', loadGroup(), ownerOnly, wrap(async (req, res) => {
    if (!validName(req.body?.name)) return res.status(400).json({ error: 'Nazwa grupy jest wymagana' });
    res.json(await store.updateGroup(req.group.id, { name: req.body.name.trim() }));
  }));

  app.delete('/groups/:groupId', loadGroup(), ownerOnly, wrap(async (req, res) => {
    await store.deleteGroup(req.group.id);
    res.status(204).end();
  }));

  // Dodanie członka po adresie e-mail – dane użytkownika pobiera auth-service.
  app.post('/groups/:groupId/members', loadGroup(), ownerOnly, wrap(async (req, res) => {
    const email = req.body?.email;
    if (typeof email !== 'string' || !email.includes('@')) {
      return res.status(400).json({ error: 'Podaj adres e-mail użytkownika' });
    }
    let found;
    try {
      found = await authClient.lookupByEmail(req.token, email.trim());
    } catch {
      return res.status(503).json({ error: 'Usługa uwierzytelniania jest niedostępna' });
    }
    if (!found) return res.status(404).json({ error: 'Nie ma użytkownika o tym adresie – musi się najpierw zarejestrować' });
    res.status(201).json(await store.addMember(req.group.id, { userId: found.id, name: found.name }));
  }));

  // ----- wydatki -----
  app.post('/groups/:groupId/expenses', loadGroup(), wrap(async (req, res) => {
    const parsed = parseExpense(req.body, req.group);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    res.status(201).json(await store.createExpense({ groupId: req.group.id, ...parsed.value }));
  }));

  app.get('/groups/:groupId/expenses', loadGroup(), wrap(async (req, res) => {
    res.json(await store.listExpenses(req.group.id));
  }));

  const loadExpense = wrap(async (req, res, next) => {
    const id = toId(req.params.expenseId);
    const expense = id && (await store.getExpense(id));
    if (!expense || expense.groupId !== req.group.id) {
      return res.status(404).json({ error: 'Nie znaleziono wydatku' });
    }
    req.expense = expense;
    next();
  });

  app.get('/groups/:groupId/expenses/:expenseId', loadGroup(), loadExpense, (req, res) => res.json(req.expense));

  app.put('/groups/:groupId/expenses/:expenseId', loadGroup(), loadExpense, wrap(async (req, res) => {
    const parsed = parseExpense(req.body, req.group);
    if (parsed.error) return res.status(400).json({ error: parsed.error });
    res.json(await store.updateExpense(req.expense.id, parsed.value));
  }));

  app.delete('/groups/:groupId/expenses/:expenseId', loadGroup(), loadExpense, wrap(async (req, res) => {
    await store.deleteExpense(req.expense.id);
    res.status(204).end();
  }));

  // ----- rozliczenie -----
  app.get('/groups/:groupId/balances', loadGroup(), wrap(async (req, res) => {
    const expenses = await store.listExpenses(req.group.id);
    const balances = computeBalances(req.group.members.map((m) => m.userId), expenses);
    res.json({ balances, transfers: settle(balances) });
  }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Nieprawidłowy JSON' });
    console.error(err);
    res.status(500).json({ error: 'Błąd serwera' });
  });

  return app;
}

module.exports = { createApp };
