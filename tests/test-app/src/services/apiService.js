const axios = require('axios');

async function callExternalApi() {
  const url = 'https://httpbin.org/get';
  const res = await axios.get(url, { timeout: 5000 });
  return res.data;
}
async function wrongEndpoint() {
  // 404 due to wrong base path
  await axios.get('https://httpbin.org/does-not-exist', { timeout: 3000 });
}

async function missingHeaders() {
  // Force a wrong/missing content-type by explicitly setting a bad header
  const url = 'https://httpbin.org/post';
  const res = await axios.post(url, { a: 1 }, { headers: { 'Content-Type': 'text/plain' } });
  // httpbin echoes received headers; fail if content-type is not application/json
  const echoed = res.data?.headers || {};
  const ct = echoed['Content-Type'] || echoed['content-type'];
  if (!ct || !/^application\/json/i.test(ct)) {
    throw new Error('missing or wrong content-type');
  }
  return res.data;
}

async function timeoutScenario() {
  const url = 'https://httpbin.org/delay/5';
  // shorter timeout to force timeout
  await axios.get(url, { timeout: 1000 });
}

async function schemaMismatch() {
  const url = 'https://httpbin.org/json';
  const res = await axios.get(url, { timeout: 5000 });
  // Intentionally require fields that httpbin JSON does not provide
  const slide0 = res.data?.slideshow?.slides?.[0];
  const displayTitle = slide0?.displayTitle; // non-existent
  const authorId = res.data?.slideshow?.authorId; // non-existent
  if (!displayTitle || !authorId) {
    throw new Error('schema mismatch: expected displayTitle and authorId');
  }
  return res.data;
}

function serializationError() {
  const circular = {};
  circular.self = circular;
  JSON.stringify(circular);
}


module.exports = {
  callExternalApi,
  wrongEndpoint,
  missingHeaders,
  timeoutScenario,
  schemaMismatch,
  serializationError,
};
