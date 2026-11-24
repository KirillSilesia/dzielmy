const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function createApp({ store, jwtSecret, bcryptRounds = 12 }) {
  const app = express();
  app.use(express.json());

  const publicUser = (u) => ({ id: u.id, email: u.email, name: u.name });
  const wrap = (fn) => (req, res, next) => fn(req, res, next).catch(next);

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'auth-service' }));

  app.post('/register', wrap(async (req, res) => {
    const { email, password, name } = req.body || {};
    if (typeof email !== 'string' || !EMAIL_RE.test(email)) {
      return res.status(400).json({ error: 'Nieprawidłowy adres e-mail' });
    }
    if (typeof password !== 'string' || password.length < 8) {
      return res.status(400).json({ error: 'Hasło musi mieć co najmniej 8 znaków' });
    }
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Imię jest wymagane' });
    }
    const normalized = email.toLowerCase();
    if (await store.findByEmail(normalized)) {
      return res.status(409).json({ error: 'Użytkownik o tym adresie już istnieje' });
    }
    // Hasło nigdy nie jest zapisywane jawnie – tylko skrót bcrypt.
    const passwordHash = await bcrypt.hash(password, bcryptRounds);
    const user = await store.create({ email: normalized, name: name.trim(), passwordHash });
    res.status(201).json(publicUser(user));
  }));

  app.post('/login', wrap(async (req, res) => {
    const { email, password } = req.body || {};
    if (typeof email !== 'string' || typeof password !== 'string') {
      return res.status(400).json({ error: 'E-mail i hasło są wymagane' });
    }
    const user = await store.findByEmail(email.toLowerCase());
    const ok = user && (await bcrypt.compare(password, user.passwordHash));
    if (!ok) return res.status(401).json({ error: 'Nieprawidłowy e-mail lub hasło' });
    const token = jwt.sign({ sub: user.id }, jwtSecret, { expiresIn: '1h' });
    res.json({ token, user: publicUser(user) });
  }));

  // Sprawdza token z nagłówka Authorization i wczytuje zalogowanego użytkownika.
  const authenticate = wrap(async (req, res, next) => {
    const [scheme, token] = (req.headers.authorization || '').split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Brak tokenu' });
    let payload;
    try {
      payload = jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'Nieprawidłowy lub wygasły token' });
    }
    const user = await store.findById(payload.sub);
    if (!user) return res.status(401).json({ error: 'Użytkownik nie istnieje' });
    req.user = user;
    next();
  });

  // Endpoint dla innych usług: sprawdza token i zwraca dane użytkownika.
  app.get('/verify', authenticate, (req, res) => res.json(publicUser(req.user)));

  // Wyszukanie użytkownika po e-mailu (np. przy dodawaniu do grupy). Tylko dla zalogowanych.
  app.get('/users/lookup', authenticate, wrap(async (req, res) => {
    const email = String(req.query.email || '').toLowerCase();
    const user = EMAIL_RE.test(email) ? await store.findByEmail(email) : null;
    if (!user) return res.status(404).json({ error: 'Nie znaleziono użytkownika o tym adresie' });
    res.json(publicUser(user));
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
