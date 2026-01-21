const axios = require('axios');

async function callThirdParty() {
  const base = process.env.THIRD_PARTY_BASE_URL || 'http://localhost:3002';
  const url = base + '/slow-endpoint';
  const res = await axios.get(url, { timeout: 3000 });
  return res.data;
}

async function tavilySearch(query) {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey) throw new Error('TAVILY_API_KEY not set');
  const url = 'https://api.tavily.com/search';
  const res = await axios.post(url, { query, max_results: 3 }, {
    headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
    timeout: 5000
  });
  return res.data;
}

async function openaiChat(message) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY not set');
  const url = 'https://api.openai.com/v1/chat/completions';
  const payload = {
    model: 'gpt-4o-mini',
    messages: [ { role: 'user', content: message } ],
    temperature: 0.2
  };
  const res = await axios.post(url, payload, {
    headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    timeout: 10000
  });
  return res.data;
}


function baseUrl() {
  return process.env.THIRD_PARTY_BASE_URL || 'http://localhost:3002';
}

async function sdkRateLimit() {
  try {
    await axios.get(baseUrl() + '/rate-limit', { timeout: 3000 });
  } catch (e) { throw e; }
}

async function sdkAuthRequired(apiKey) {
  try {
    const res = await axios.get(baseUrl() + '/auth-required', { headers: { 'x-api-key': apiKey || '' }, timeout: 3000 });
    return res.data;
  } catch (e) { throw e; }
}

async function sdkSchemaDrift() {
  try {
    const res = await axios.get(baseUrl() + '/schema-drift', { timeout: 3000 });
    // Expect { name } but API returns { displayName }
    if (!res.data || !res.data.name) {
      const err = new Error('schema drift: expected field name');
      err.upstream = res.data;
      throw err;
    }
    return res.data;
  } catch (e) { throw e; }
}

async function sdkIntermittent() {
  try {
    const res = await axios.get(baseUrl() + '/intermittent', { timeout: 3000 });
    return res.data;
  } catch (e) { throw e; }
}

async function sdkTimeoutThenSuccess(delayMs) {
  try {
    const res = await axios.get(baseUrl() + '/timeout-then-success', { params: { delay: delayMs || 3000 }, timeout: 1000 });
    return res.data;
  } catch (e) { throw e; }
}

async function sdkInvalidJson() {
  try {
    const res = await axios.get(baseUrl() + '/invalid-json', { timeout: 3000, transformResponse: [d => d] });
    JSON.parse(res.data); // will throw
    return res.data;
  } catch (e) { throw e; }
}

async function sdkSlowChunked() {
  try {
    const res = await axios.get(baseUrl() + '/slow-chunked', { timeout: 1000 });
    return res.data;
  } catch (e) { throw e; }
}

module.exports = { 
  callThirdParty, tavilySearch, openaiChat,
  sdkRateLimit, sdkAuthRequired, sdkSchemaDrift, sdkIntermittent,
  sdkTimeoutThenSuccess, sdkInvalidJson, sdkSlowChunked
};
