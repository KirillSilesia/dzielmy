// Dwie implementacje tego samego interfejsu: pamięciowa (testy) i PostgreSQL (produkcja).

function createMemoryStore() {
  const users = [];
  return {
    async init() {},
    async findByEmail(email) {
      return users.find((u) => u.email === email) || null;
    },
    async findById(id) {
      return users.find((u) => u.id === id) || null;
    },
    async create({ email, name, passwordHash }) {
      const user = { id: users.length + 1, email, name, passwordHash };
      users.push(user);
      return user;
    },
  };
}

function createPgStore(pool) {
  const map = (r) => r && { id: r.id, email: r.email, name: r.name, passwordHash: r.password_hash };
  return {
    async init() {
      await pool.query(`
        CREATE SCHEMA IF NOT EXISTS auth;
        CREATE TABLE IF NOT EXISTS auth.users (
          id SERIAL PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          name TEXT NOT NULL,
          password_hash TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );`);
    },
    async findByEmail(email) {
      const { rows } = await pool.query('SELECT * FROM auth.users WHERE email = $1', [email]);
      return map(rows[0]) || null;
    },
    async findById(id) {
      const { rows } = await pool.query('SELECT * FROM auth.users WHERE id = $1', [id]);
      return map(rows[0]) || null;
    },
    async create({ email, name, passwordHash }) {
      const { rows } = await pool.query(
        'INSERT INTO auth.users (email, name, password_hash) VALUES ($1, $2, $3) RETURNING *',
        [email, name, passwordHash]
      );
      return map(rows[0]);
    },
  };
}

module.exports = { createMemoryStore, createPgStore };
