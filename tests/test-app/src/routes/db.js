const router = require('express').Router();
const { dbInit, createUser, listUsers, scenarios } = require('../services/dbService');

router.post('/init', async (req, res) => {
  await dbInit();
  res.json({ ok: true });
});

router.post('/users', async (req, res) => {
  const user = await createUser(req.body);
  res.json(user);
});

router.get('/users', async (req, res) => {
  const users = await listUsers();
  res.json(users);
});



router.get('/wrong-sql', async (req, res, next) => {
  try { await scenarios.wrongSql(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/bad-agg', async (req, res, next) => {
  try { await scenarios.badAggregation(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/missing-index', async (req, res, next) => {
  try { const info = await scenarios.missingIndexCheck(); res.json({ indexes: info }); } catch (e) { next(e); }
});

router.post('/txn-no-rollback', async (req, res, next) => {
  try {
    const { aEmail, aName, bEmail, bName } = req.body || {};
    await scenarios.txnNoRollback(aEmail || 'a@test.dev', aName || 'A', bEmail || 'b@test.dev', bName || 'B');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

router.get('/lock-contention', async (req, res, next) => {
  try { await scenarios.lockContention(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/migration-missing-col', async (req, res, next) => {
  try { await scenarios.migrationMissingColumn(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.post('/duplicate-race', async (req, res, next) => {
  try {
    const { email, name } = req.body || {};
    await scenarios.duplicateRace(email || 'dup@test.dev', name || 'Dup');
    res.json({ ok: true });
  } catch (e) { next(e); }
});

module.exports = router;
