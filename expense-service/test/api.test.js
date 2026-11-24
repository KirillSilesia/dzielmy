const request = require('supertest');
const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/store');

// Zamiast prawdziwego auth-service: token "ala" -> użytkownik 1, "ola" -> 2, "jan" -> 3.
const users = {
  ala: { id: 1, name: 'Ala', email: 'ala@example.com' },
  ola: { id: 2, name: 'Ola', email: 'ola@example.com' },
  jan: { id: 3, name: 'Jan', email: 'jan@example.com' },
};
const authClient = {
  async verify(token) {
    if (token === 'awaria') throw new Error('brak połączenia');
    return users[token] || null;
  },
  async lookupByEmail(token, email) {
    return Object.values(users).find((u) => u.email === email.toLowerCase()) || null;
  },
};

let app;
const as = (token) => ({ Authorization: `Bearer ${token}` });

beforeEach(() => {
  app = createApp({ store: createMemoryStore(), authClient });
});

async function createGroupWithOla() {
  const group = await request(app).post('/groups').set(as('ala')).send({ name: 'Mieszkanie' });
  await request(app).post('/groups/1/members').set(as('ala')).send({ email: 'ola@example.com' });
  return group.body;
}

test('GET /health działa bez tokenu', async () => {
  expect((await request(app).get('/health')).status).toBe(200);
});

test('żądania bez tokenu lub z błędnym tokenem dostają 401', async () => {
  expect((await request(app).get('/groups')).status).toBe(401);
  expect((await request(app).get('/groups').set(as('nikt'))).status).toBe(401);
});

test('niedostępny auth-service daje 503', async () => {
  expect((await request(app).get('/groups').set(as('awaria'))).status).toBe(503);
});

test('CRUD grupy', async () => {
  const created = await request(app).post('/groups').set(as('ala')).send({ name: 'Wyjazd' });
  expect(created.status).toBe(201);
  expect(created.body.members).toEqual([{ userId: 1, name: 'Ala' }]);

  expect((await request(app).get('/groups').set(as('ala'))).body).toHaveLength(1);

  const updated = await request(app).put('/groups/1').set(as('ala')).send({ name: 'Wyjazd w góry' });
  expect(updated.body.name).toBe('Wyjazd w góry');

  expect((await request(app).delete('/groups/1').set(as('ala'))).status).toBe(204);
  expect((await request(app).get('/groups/1').set(as('ala'))).status).toBe(404);
});

test('osoba spoza grupy nie widzi grupy, a członek nie może jej usunąć', async () => {
  await createGroupWithOla();
  expect((await request(app).get('/groups/1').set(as('jan'))).status).toBe(404);
  expect((await request(app).get('/groups').set(as('jan'))).body).toEqual([]);
  expect((await request(app).delete('/groups/1').set(as('ola'))).status).toBe(403);
});

test('CRUD wydatku', async () => {
  await createGroupWithOla();
  const created = await request(app).post('/groups/1/expenses').set(as('ola'))
    .send({ description: 'Zakupy', amountCents: 5000, paidBy: 2 });
  expect(created.status).toBe(201);

  const list = await request(app).get('/groups/1/expenses').set(as('ala'));
  expect(list.body).toHaveLength(1);

  const updated = await request(app).put('/groups/1/expenses/1').set(as('ala'))
    .send({ description: 'Zakupy spożywcze', amountCents: 6000, paidBy: 2 });
  expect(updated.body.amountCents).toBe(6000);

  expect((await request(app).delete('/groups/1/expenses/1').set(as('ala'))).status).toBe(204);
  expect((await request(app).get('/groups/1/expenses/1').set(as('ala'))).status).toBe(404);
});

test('walidacja wydatku', async () => {
  await createGroupWithOla();
  const post = (body) => request(app).post('/groups/1/expenses').set(as('ala')).send(body);
  expect((await post({ description: '', amountCents: 100, paidBy: 1 })).status).toBe(400);
  expect((await post({ description: 'X', amountCents: -5, paidBy: 1 })).status).toBe(400);
  expect((await post({ description: 'X', amountCents: 10.5, paidBy: 1 })).status).toBe(400);
  expect((await post({ description: 'X', amountCents: 100, paidBy: 3 })).status).toBe(400);
});

test('rozliczenie pokazuje, kto komu ile jest winien', async () => {
  await createGroupWithOla();
  await request(app).post('/groups/1/expenses').set(as('ala'))
    .send({ description: 'Czynsz', amountCents: 200000, paidBy: 1 });
  await request(app).post('/groups/1/expenses').set(as('ola'))
    .send({ description: 'Internet', amountCents: 6000, paidBy: 2 });
  const res = await request(app).get('/groups/1/balances').set(as('ola'));
  expect(res.body.balances).toEqual({ 1: 97000, 2: -97000 });
  expect(res.body.transfers).toEqual([{ from: 2, to: 1, amountCents: 97000 }]);
});

test('dodanie członka po e-mailu', async () => {
  await request(app).post('/groups').set(as('ala')).send({ name: 'Mieszkanie' });
  const added = await request(app).post('/groups/1/members').set(as('ala')).send({ email: 'Jan@example.com' });
  expect(added.status).toBe(201);
  expect(added.body.members.map((m) => m.userId)).toEqual([1, 3]);
  expect((await request(app).post('/groups/1/members').set(as('ala')).send({ email: 'nikt@example.com' })).status).toBe(404);
  expect((await request(app).post('/groups/1/members').set(as('ala')).send({ email: 'bez-malpy' })).status).toBe(400);
});
