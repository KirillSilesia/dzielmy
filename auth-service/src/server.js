const { Pool } = require('pg');
const { createApp } = require('./app');
const { createPgStore } = require('./store');

async function main() {
  const { DATABASE_URL, JWT_SECRET, PORT = 3001 } = process.env;
  if (!DATABASE_URL || !JWT_SECRET) {
    throw new Error('Wymagane zmienne środowiskowe: DATABASE_URL, JWT_SECRET');
  }
  const store = createPgStore(new Pool({ connectionString: DATABASE_URL }));
  await store.init();
  createApp({ store, jwtSecret: JWT_SECRET }).listen(PORT, () => {
    console.log(`auth-service nasłuchuje na porcie ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
