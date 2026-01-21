const Ajv = require('ajv');
const ajv = new Ajv({ allErrors: true, useDefaults: true });

const schema = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    age: { type: 'integer', minimum: 0 },
    nums: { type: 'array', items: { type: 'number' }, default: [] }
  },
  required: ['name'],
  additionalProperties: false
};

const validate = ajv.compile(schema);

function validatePayload(payload) {
  const ok = validate(payload);
  if (!ok) throw new Error(ajv.errorsText(validate.errors));
  return true;
}

function transformNumbers(nums = []) {
  return (nums || []).reduce((acc, n) => acc + n, 0);
  
  // SOLUTION: Normalize inputs to numbers and validate
  // return (nums || []).reduce((acc, n) => acc + Number(n), 0);
}

function formatDate(iso) {
  // BUG: Use locale string (timezone-dependent) causing inconsistent results/off-by-one
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString();
  
  // SOLUTION: Use UTC-normalized output
  // return d.toISOString();
}

// JSON parse/stringify issues
function jsonParseError(data) {
  // BUG: No error handling for malformed JSON
  const parsed = JSON.parse(data);
  return parsed;
  
  // SOLUTION: Add try-catch
  // try {
  //   return JSON.parse(data);
  // } catch (e) {
  //   throw new Error('Invalid JSON: ' + e.message);
  // }
}



// Schema validation issues
function schemaValidationBug(payload) {
  // BUG: Missing default values and strict validation
  const ok = validate(payload);
  if (!ok) throw new Error(ajv.errorsText(validate.errors));
  return payload;
  
  // SOLUTION: Add defaults and better error handling
  // const validated = { ...defaultValues, ...payload };
  // if (!validate(validated)) {
  //   throw new ValidationError(validate.errors);
  // }
  // return validated;
}


module.exports = { 
  validatePayload, 
  transformNumbers, 
  formatDate,
  jsonParseError,
  schemaValidationBug,
};
