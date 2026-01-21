function evaluateRule(a, b, op = 'gt') {
  switch (op) {
    case 'gt': return a > b;
    case 'gte': return a >= b;
    case 'lt': return a < b;
    case 'eq': return a === b;
    default: return null;
  }
}

function sortNumbers(nums = []) {
  return [...(nums || [])].sort((x, y) => x - y);
}

function levenshtein(a = '', b = '') {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }
  return dp[m][n];
}

function knapsack01(items = [], capacity = 0) {
  const n = items.length;
  const dp = Array.from({ length: n + 1 }, () => Array(capacity + 1).fill(0));
  for (let i = 1; i <= n; i++) {
    const { weight, value } = items[i - 1];
    for (let w = 0; w <= capacity; w++) {
      dp[i][w] = dp[i - 1][w];
      if (weight <= w) dp[i][w] = Math.max(dp[i][w], dp[i - 1][w - weight] + value);
    }
  }
  return dp[n][capacity];
}

function dijkstra(graph = {}, start) {
  const dist = {}; const visited = new Set();
  Object.keys(graph).forEach(k => dist[k] = Infinity);
  dist[start] = 0;
  while (visited.size < Object.keys(graph).length) {
    let u = null, best = Infinity;
    for (const k of Object.keys(graph)) {
      if (!visited.has(k) && dist[k] < best) { best = dist[k]; u = k; }
    }
    if (u == null) break; // disconnected
    visited.add(u);
    for (const [v, w] of Object.entries(graph[u] || {})) {
      const alt = dist[u] + Number(w);
      if (alt < dist[v]) dist[v] = alt;
    }
  }
  return dist;
}

function topKFrequent(arr = [], k = 1) {
  const freq = new Map();
  for (const x of arr) freq.set(x, (freq.get(x) || 0) + 1);
  const entries = Array.from(freq.entries());
  entries.sort((a, b) => b[1] - a[1]);
  return entries.slice(0, k).map(([v]) => v);
}

function mergeIntervals(intervals = []) {
  const a = intervals.slice().sort((i, j) => i[0] - j[0]);
  const out = [];
  for (const cur of a) {
    if (!out.length || cur[0] > out[out.length - 1][1]) out.push(cur.slice());
    else out[out.length - 1][1] = Math.max(out[out.length - 1][1], cur[1]);
  }
  return out;
}

function matMul(A = [[]], B = [[]]) {
  const r = A.length, c = B[0]?.length || 0, inner = B.length;
  const out = Array.from({ length: r }, () => Array(c).fill(0));
  for (let i = 0; i < r; i++) {
    for (let k = 0; k < inner; k++) {
      for (let j = 0; j < c; j++) {
        out[i][j] += (A[i][k] || 0) * (B[k]?.[j] || 0);
      }
    }
  }
  return out;
}

function evalExpr(expr = '') {
  // Shunting-yard to RPN then evaluate
  const prec = { '+': 1, '-': 1, '*': 2, '/': 2 };
  const output = [], ops = [];
  const tokens = expr.match(/\d+\.?\d*|[+\-*/()]|\s+/g)?.filter(t => !/^\s+$/.test(t)) || [];
  for (const t of tokens) {
    if (/^\d/.test(t)) output.push(Number(t));
    else if (t in prec) {
      while (ops.length && prec[ops[ops.length - 1]] >= prec[t]) output.push(ops.pop());
      ops.push(t);
    } else if (t === '(') ops.push(t);
    else if (t === ')') { while (ops.length && ops[ops.length - 1] !== '(') output.push(ops.pop()); ops.pop(); }
  }
  while (ops.length) output.push(ops.pop());
  const stack = [];
  for (const t of output) {
    if (typeof t === 'number') stack.push(t);
    else {
      const b = stack.pop(), a = stack.pop();
      if (t === '+') stack.push(a + b);
      else if (t === '-') stack.push(a - b);
      else if (t === '*') stack.push(a * b);
      else if (t === '/') stack.push(a / b);
    }
  }
  return stack.pop() ?? 0;
}

module.exports = {
  evaluateRule,
  sortNumbers,
  levenshtein,
  knapsack01,
  dijkstra,
  topKFrequent,
  mergeIntervals,
  matMul,
  evalExpr,
};
  