const fs = require('fs');
const path = require('path');
const axios = require('axios');


function getLocalDependencies() {
  const pkgPath = path.join(__dirname, '..', '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
  return deps;
}

function normalizeVersion(v = '') {
  return String(v).replace(/^\^|^~|^>=?|^<=?|^=\s*/g, '').trim();
}

function cmp(a, b) {
  const pa = String(a).split('.').map(n => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const da = pa[i] || 0, db = pb[i] || 0;
    if (da !== db) return da - db;
  }
  return 0;
}

function satisfies(version, range) {
  const v = normalizeVersion(version);
  const r = String(range).trim();
  if (r.startsWith('^') || r.startsWith('~')) {
    const base = normalizeVersion(r);
    const [maj, min] = base.split('.');
    if (r.startsWith('^')) return v.split('.')[0] === maj && cmp(v, base) >= 0;
    if (r.startsWith('~')) return v.split('.')[0] === maj && v.split('.')[1] === (min || '0') && cmp(v, base) >= 0;
  }
  if (r.startsWith('>=')) return cmp(v, normalizeVersion(r)) >= 0;
  if (r.startsWith('<=')) return cmp(v, normalizeVersion(r)) <= 0;
  if (r.startsWith('=')) return cmp(v, normalizeVersion(r)) === 0;
  return cmp(v, normalizeVersion(r)) === 0;
}

async function fetchLatestVersion(pkgName) {
  const base = process.env.NPM_REGISTRY || 'https://registry.npmjs.org';
  const url = `${base}/${encodeURIComponent(pkgName)}/latest`;
  const res = await axios.get(url, { timeout: 5000 });
  return res.data.version;
}

async function depsStatus() {
  const rootDir = path.join(__dirname, '..', '..');
  const hasNpmLock = fs.existsSync(path.join(rootDir, 'package-lock.json'));
  const hasYarnLock = fs.existsSync(path.join(rootDir, 'yarn.lock'));
  if (hasNpmLock && hasYarnLock) {
    throw new Error('lockfile conflict: both package-lock.json and yarn.lock present');
  }

  const deps = getLocalDependencies();
  const names = Object.keys(deps);
  const results = [];

  // 2) Package name casing issue (npm packages are lowercase by convention)
  const hasCasingIssue = names.some((n) => /[A-Z]/.test(n));
  if (hasCasingIssue) {
    throw new Error('package name casing issue: dependency names should be lowercase');
  }
  for (const name of names) {
    try {
      const currentRange = deps[name];
      const latest = await fetchLatestVersion(name);
      const currentPinned = normalizeVersion(currentRange);
      const outdated = !satisfies(latest, currentRange);
      results.push({ name, current: currentRange, currentPinned, latest, outdated });
    } catch (e) {
      results.push({ name, error: e.message });
    }
  }
  return results;
}

function resolveRange(range, available = []) {
  const sorted = available.slice().sort((a, b) => cmp(a, b));
  for (let i = sorted.length - 1; i >= 0; i--) {
    if (satisfies(sorted[i], range)) return sorted[i];
  }
  return null;
}

module.exports = {
  getLocalDependencies,
  depsStatus,
  resolveRange,
  satisfies,
  cmp,
};
  