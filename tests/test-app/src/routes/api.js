const router = require('express').Router();
const {
  callExternalApi,
  wrongEndpoint,
  missingHeaders,
  timeoutScenario,
  schemaMismatch,
  serializationError,
} = require('../services/apiService');

router.get('/external', async (req, res, next) => {
  try {
    const data = await callExternalApi();
    res.json({ data });
  } catch (err) { next(err); }
});

// Error scenario endpoints
router.get('/wrong-endpoint', async (req, res, next) => {
  try { await wrongEndpoint(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.post('/missing-headers', async (req, res, next) => {
  try { const data = await missingHeaders(); res.json({ data }); } catch (e) { next(e); }
});

router.get('/timeout', async (req, res, next) => {
  try { await timeoutScenario(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/schema-mismatch', async (req, res, next) => {
  try { const data = await schemaMismatch(); res.json({ data }); } catch (e) { next(e); }
});

router.get('/serialization-error', (req, res, next) => {
  try { serializationError(); res.json({ ok: true }); } catch (e) { next(e); }
});


module.exports = router;
