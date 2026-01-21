const router = require('express').Router();
const {
  evaluateRule,
  sortNumbers,
  levenshtein,
  knapsack01,
  dijkstra,
  topKFrequent,
  mergeIntervals,
  matMul,
  evalExpr,
} = require('../services/logicService');
const { bugs } = require('../services/logicService');

router.post('/compute', (req, res) => {
  try {
    const {
      a, b, cmp,
      nums,
      items, capacity,
      graph, start,
      arr, k,
      intervals,
      A, B,
      expr,
    } = req.body || {};

    const out = {
      rule: evaluateRule(a, b, cmp || 'gt'),
      sort: sortNumbers(nums || []),
      levenshtein: levenshtein(String(a ?? ''), String(b ?? '')),
      knapsack: knapsack01(items || [], Number(capacity || 0)),
      dijkstra: dijkstra(graph || {}, start),
      topk: topKFrequent(arr || [], Number(k || 1)),
      mergeIntervals: mergeIntervals(intervals || []),
      matmul: matMul(A || [[]], B || [[]]),
      eval: evalExpr(expr || ''),
    };

    return res.json(out);
  } catch (e) {
    return res.status(400).json({ error: e.message });
  }
});

module.exports = router;
