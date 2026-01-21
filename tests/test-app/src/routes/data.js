const router = require('express').Router();
const { 
  validatePayload, 
  transformNumbers, 
  formatDate,
  jsonParseError,
  schemaValidationBug,
} = require('../services/dataService');

router.post('/validate', (req, res) => {
  try {
    const ok = validatePayload(req.body);
    res.json({ ok });
  } catch (e) {
    console.error("Request error", {
      id: req.id,
      status: 400,
      message: e.message,
    });
    res.status(400).json({ error: e.message });
  }
});

router.post('/transform', (req, res) => {
  const { nums = [] } = req.body || {};
  res.json({ sum: transformNumbers(nums) });
});

router.get('/format-date', (req, res) => {
  const { iso } = req.query;
  res.json({ formatted: formatDate(iso) });
});

router.post('/json-parse', (req, res) => {
  try {
    const { data } = req.body || {};
    const parsed = jsonParseError(data);
    res.json({ parsed });
  } catch (e) {
    console.error("Request error", {
      id: req.id,
      status: 400,
      message: e.message,
    });
    res.status(400).json({ error: e.message });
  }
});
router.post('/schema-validation', (req, res) => {
  try {
    const result = schemaValidationBug(req.body);
    res.json({ result });
  } catch (e) {
    console.error("Request error", {
      id: req.id,
      status: 400,
      message: e.message,
    });
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
