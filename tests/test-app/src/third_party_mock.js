const express = require('express');
const app = express();

app.get('/slow-endpoint', async (req, res) => {
  const delay = Number(req.query.delay || 500);
  await new Promise(r => setTimeout(r, delay));
  res.json({ ok: true, ts: Date.now(), note: 'Third-party mock' });
});

app.get('/rate-limit', (req, res) => {
  res.setHeader('Retry-After', '2');
  res.status(429).json({ error: 'rate_limited', message: 'Too many requests' });
});

app.get('/auth-required', (req, res) => {
  const apiKey = req.headers['x-api-key'];
  if (!apiKey) return res.status(401).json({ error: 'unauthorized', message: 'API key missing' });
  if (apiKey !== 'valid-key') return res.status(403).json({ error: 'forbidden', message: 'Invalid API key' });
  res.json({ ok: true });
});

app.get('/schema-drift', (req, res) => {
  res.json({ id: '123', displayName: 'Widget', // expected: name
             meta: { v: 2 } });
});

app.get('/intermittent', (req, res) => {
  if (Math.random() < 0.5) return res.status(500).json({ error: 'flaky', message: 'Random failure' });
  res.json({ ok: true, ts: Date.now() });
});

app.get('/timeout-then-success', async (req, res) => {
  await new Promise(r => setTimeout(r, Number(req.query.delay || 3000)));
  res.json({ ok: true });
});

app.post('/payload-too-large', express.json({ limit: '1kb' }), (req, res) => {
  res.json({ ok: true });
});

app.get('/redirect-loop', (req, res) => {
  const hop = Number(req.query.hop || 0);
  if (hop > 5) return res.status(508).json({ error: 'loop_detected' });
  const next = new URL(req.protocol + '://' + req.get('host') + req.originalUrl);
  next.searchParams.set('hop', String(hop + 1));
  res.redirect(302, next.toString());
});

app.get('/invalid-json', (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.end('{ invalid: json');
});

app.get('/slow-chunked', async (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.write('{"ok":true,"chunks":["a"');
  await new Promise(r => setTimeout(r, 1500));
  res.write(',"b"');
  await new Promise(r => setTimeout(r, 1500));
  res.end(']}');
});

const PORT = 3002;
app.listen(PORT, () => console.log(`🧪 Mock service running at http://localhost:${PORT}`));
