const { Pool } = require('pg');
const { createApp } = require('./app');
const { createPgStore } = require('./store');
const { createAuthClient } = require('./authClient');

async function main() {
  const { DATABASE_URL, AUTH_URL, PORT = 3002 } = process.env;
  if (!DATABASE_URL || !AUTH_URL) {
    throw new Error('Wymagane zmienne środowiskowe: DATABASE_URL, AUTH_URL');
  }
  const store = createPgStore(new Pool({ connectionString: DATABASE_URL }));
  await store.init();
  createApp({ store, authClient: createAuthClient(AUTH_URL) }).listen(PORT, () => {
    console.log(`expense-service nasłuchuje na porcie ${PORT}`);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
