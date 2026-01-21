const router = require('express').Router();
const { depsStatus, getLocalDependencies, resolveRange, satisfies } = require('../services/depService');

router.get('/status', async (req, res, next) => {
  try {
    const status = await depsStatus();
    res.json({ status });
  } catch (e) { next(e); }
});

router.get('/local', (req, res) => {
  res.json({ dependencies: getLocalDependencies() });
});

router.get('/sse', async (req, res) => {
  const { badHeaders, fast, noHeartbeat, buffer, noCloseCleanup } = req.query;

  // BUG: Wrong headers when badHeaders=true
  if (badHeaders === 'true') {
    res.setHeader('Content-Type', 'text/plain'); // should be text/event-stream
  } else {
    res.setHeader('Content-Type', 'text/event-stream');
  }
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // BUG: Enable proxy buffering when buffer=true (SSE should disable buffering)
  if (buffer === 'true') {
    res.setHeader('X-Accel-Buffering', 'on'); // SOLUTION: set to 'no'
  }

  res.flushHeaders?.();

  let active = true;
  const onClose = () => { active = false; clearInterval(heartbeatTimer); };
  req.on('close', onClose);

  const send = (event, data) => {
    // BUG: Missing id/retry fields may cause reconnect storms
    // SOLUTION: res.write(`retry: 5000\n`);
    // SOLUTION: res.write(`id: ${Date.now()}\n`);
    res.write(`event: ${event}\n`);
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {
      // BUG: No error handling on write/serialization
    }
  };

  // Heartbeats keep intermediaries from closing idle connections
  let heartbeatTimer = null;
  if (noHeartbeat !== 'true') {
    heartbeatTimer = setInterval(() => {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    }, 15000);
  }

  send('hello', { ts: Date.now() });
  const intervalMs = fast === 'true' ? 50 : 5000; // BUG: too-fast sends can cause backpressure when fast=true
  while (active) {
    try {
      const status = await depsStatus();
      send('status', status);
    } catch (e) {
      send('error', { message: e.message });
    }
    await new Promise(r => setTimeout(r, intervalMs));
  }

  // BUG: When noCloseCleanup=true, listeners/timers leak
  if (noCloseCleanup === 'true') {
    // intentionally skip cleanup
    return;
  }
  req.off?.('close', onClose);
  clearInterval(heartbeatTimer);
});

router.post('/resolve', (req, res) => {
  const { range, available = [] } = req.body || {};
  res.json({ resolved: resolveRange(range, available) });
});

router.post('/satisfies', (req, res) => {
  const { version, range } = req.body || {};
  res.json({ ok: satisfies(version, range) });
});

module.exports = router;
