const router = require('express').Router();
const { callThirdParty, tavilySearch, openaiChat,
  sdkRateLimit, sdkAuthRequired, sdkSchemaDrift, sdkIntermittent,
  sdkTimeoutThenSuccess, sdkInvalidJson, sdkSlowChunked } = require('../services/thirdPartyService');
require('dotenv').config();

router.get('/call', async (req, res, next) => {
  try {
    const data = await callThirdParty();
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/tavily', async (req, res, next) => {
  try {
    const { q = 'LangChain' } = req.query;
    const data = await tavilySearch(q);
    res.json({ data });
  } catch (e) { next(e); }
});

router.post('/openai-chat', async (req, res, next) => {
  try {
    const { message = 'Say hello' } = req.body || {};
    const data = await openaiChat(message);
    res.json({ data });
  } catch (e) { next(e); }
});

router.get('/mock/rate-limit', async (req, res, next) => {
  try { await sdkRateLimit(); res.json({ ok: true }); } catch (e) { next(e); }
});

router.get('/mock/auth-required', async (req, res, next) => {
  try { const data = await sdkAuthRequired(req.headers['x-api-key']); res.json({ data }); } catch (e) { next(e); }
});

router.get('/mock/schema-drift', async (req, res, next) => {
  try { const data = await sdkSchemaDrift(); res.json({ data }); } catch (e) { next(e); }
});

router.get('/mock/intermittent', async (req, res, next) => {
  try { const data = await sdkIntermittent(); res.json({ data }); } catch (e) { next(e); }
});

router.get('/mock/timeout', async (req, res, next) => {
  try { const data = await sdkTimeoutThenSuccess(Number(req.query.delay || 3000)); res.json({ data }); } catch (e) { next(e); }
});

router.get('/mock/invalid-json', async (req, res, next) => {
  try { const data = await sdkInvalidJson(); res.json({ data }); } catch (e) { next(e); }
});

router.get('/mock/slow-chunked', async (req, res, next) => {
  try { const data = await sdkSlowChunked(); res.json({ data }); } catch (e) { next(e); }
});
module.exports = router;