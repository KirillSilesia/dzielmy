const request = require('supertest');
const { createApp } = require('../src/app');
const { createMemoryStore } = require('../src/store');

const user = { email: 'Ala@Example.com', password: 'tajnehaslo1', name: 'Ala' };
let app;
let store;

beforeEach(() => {
  store = createMemoryStore();
  app = createApp({ store, jwtSecret: 'test-secret', bcryptRounds: 4 });
});

test('GET /health zwraca status ok', async () => {
  const res = await request(app).get('/health');
  expect(res.status).toBe(200);
  expect(res.body.status).toBe('ok');
});

test('rejestracja zapisuje skrót hasła, a nie hasło jawne', async () => {
  const res = await request(app).post('/register').send(user);
  expect(res.status).toBe(201);
  expect(res.body).toEqual({ id: 1, email: 'ala@example.com', name: 'Ala' });
  const saved = await store.findByEmail('ala@example.com');
  expect(saved.passwordHash).not.toBe(user.password);
  expect(saved.passwordHash).toMatch(/^\$2[aby]\$/);
});

test('rejestracja odrzuca zbyt krótkie hasło i zły e-mail', async () => {
  expect((await request(app).post('/register').send({ ...user, password: 'abc' })).status).toBe(400);
  expect((await request(app).post('/register').send({ ...user, email: 'zly-email' })).status).toBe(400);
});

test('rejestracja odrzuca powtórzony e-mail', async () => {
  await request(app).post('/register').send(user);
  const res = await request(app).post('/register').send(user);
  expect(res.status).toBe(409);
});

test('logowanie zwraca token, który przechodzi weryfikację', async () => {
  await request(app).post('/register').send(user);
  const login = await request(app).post('/login').send({ email: user.email, password: user.password });
  expect(login.status).toBe(200);
  const verify = await request(app).get('/verify').set('Authorization', `Bearer ${login.body.token}`);
  expect(verify.status).toBe(200);
  expect(verify.body.email).toBe('ala@example.com');
});

test('logowanie złym hasłem zwraca 401', async () => {
  await request(app).post('/register').send(user);
  const res = await request(app).post('/login').send({ email: user.email, password: 'inne-haslo' });
  expect(res.status).toBe(401);
});

test('weryfikacja bez tokenu lub z błędnym tokenem zwraca 401', async () => {
  expect((await request(app).get('/verify')).status).toBe(401);
  expect((await request(app).get('/verify').set('Authorization', 'Bearer abc')).status).toBe(401);
});

test('wyszukanie użytkownika po e-mailu wymaga tokenu i zwraca dane bez skrótu hasła', async () => {
  await request(app).post('/register').send(user);
  await request(app).post('/register').send({ email: 'ola@example.com', password: 'tajnehaslo2', name: 'Ola' });
  const login = await request(app).post('/login').send({ email: user.email, password: user.password });
  const auth = { Authorization: `Bearer ${login.body.token}` };

  expect((await request(app).get('/users/lookup?email=ola@example.com')).status).toBe(401);
  const found = await request(app).get('/users/lookup?email=OLA@example.com').set(auth);
  expect(found.status).toBe(200);
  expect(found.body).toEqual({ id: 2, email: 'ola@example.com', name: 'Ola' });
  expect((await request(app).get('/users/lookup?email=nikt@example.com').set(auth)).status).toBe(404);
});
