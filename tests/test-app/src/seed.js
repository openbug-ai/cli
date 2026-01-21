require('dotenv').config();
const { dbInit, createUser } = require('./services/dbService');

async function run() {
  await dbInit();
  const sample = [
    { email: 'alice@example.com', name: 'Alice' },
    { email: 'bob@example.com', name: 'Bob' },
    { email: 'carol@test.com', name: 'Carol' }
  ];
  for (const u of sample) {
    try { await createUser(u); } catch (e) {}
  }
  console.log('✅ Seed complete');
}
run();
