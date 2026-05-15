/**
 * Lightweight input validation utilities.
 * Zero external dependencies — uses only Node.js built-ins.
 */

function isString(value) {
  return typeof value === 'string';
}

function isNumber(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isArray(value) {
  return Array.isArray(value);
}

function validateString(value, { minLength = 0, maxLength = Infinity, pattern = null, required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) return { valid: false, error: 'Field is required' };
    return { valid: true, value: null };
  }
  if (!isString(value)) {
    return { valid: false, error: 'Expected string' };
  }
  if (value.length < minLength) {
    return { valid: false, error: `Minimum length is ${minLength}` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `Maximum length is ${maxLength}` };
  }
  if (pattern && !pattern.test(value)) {
    return { valid: false, error: 'Format validation failed' };
  }
  return { valid: true, value };
}

function validateNumber(value, { min = -Infinity, max = Infinity, integer = false, required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) return { valid: false, error: 'Field is required' };
    return { valid: true, value: null };
  }
  if (!isNumber(value)) {
    return { valid: false, error: 'Expected number' };
  }
  if (integer && !Number.isInteger(value)) {
    return { valid: false, error: 'Expected integer' };
  }
  if (value < min) {
    return { valid: false, error: `Minimum value is ${min}` };
  }
  if (value > max) {
    return { valid: false, error: `Maximum value is ${max}` };
  }
  return { valid: true, value };
}

function validateEnum(value, allowed, { required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) return { valid: false, error: 'Field is required' };
    return { valid: true, value: null };
  }
  if (!allowed.includes(value)) {
    return { valid: false, error: `Must be one of: ${allowed.join(', ')}` };
  }
  return { valid: true, value };
}

function validateArray(value, { minLength = 0, maxLength = Infinity, itemValidator = null, required = true } = {}) {
  if (value === undefined || value === null) {
    if (required) return { valid: false, error: 'Field is required' };
    return { valid: true, value: null };
  }
  if (!isArray(value)) {
    return { valid: false, error: 'Expected array' };
  }
  if (value.length < minLength) {
    return { valid: false, error: `Minimum array length is ${minLength}` };
  }
  if (value.length > maxLength) {
    return { valid: false, error: `Maximum array length is ${maxLength}` };
  }
  if (itemValidator) {
    for (let i = 0; i < value.length; i++) {
      const result = itemValidator(value[i]);
      if (!result.valid) {
        return { valid: false, error: `Item ${i}: ${result.error}` };
      }
    }
  }
  return { valid: true, value };
}

function validateObject(value, { required = true, allowExtraKeys = true } = {}) {
  if (value === undefined || value === null) {
    if (required) return { valid: false, error: 'Field is required' };
    return { valid: true, value: null };
  }
  if (!isObject(value)) {
    return { valid: false, error: 'Expected object' };
  }
  return { valid: true, value };
}

function sanitizeString(value, { maxLength = 10000, allowedChars = null } = {}) {
  if (!isString(value)) return '';
  let sanitized = value;
  if (allowedChars) {
    sanitized = sanitized.split('').filter((c) => allowedChars.includes(c)).join('');
  }
  if (sanitized.length > maxLength) {
    sanitized = sanitized.slice(0, maxLength);
  }
  return sanitized;
}

function sanitizeObject(obj, { maxDepth = 3, maxKeys = 100, maxStringLength = 10000 } = {}) {
  if (!isObject(obj) && !isArray(obj)) return obj;

  function walk(value, depth) {
    if (depth > maxDepth) return null;
    if (isString(value)) {
      return value.length > maxStringLength ? value.slice(0, maxStringLength) : value;
    }
    if (isNumber(value) || isBoolean(value) || value === null) {
      return value;
    }
    if (isArray(value)) {
      return value.slice(0, maxKeys).map((v) => walk(v, depth + 1));
    }
    if (isObject(value)) {
      const keys = Object.keys(value).slice(0, maxKeys);
      const result = {};
      for (const key of keys) {
        result[key] = walk(value[key], depth + 1);
      }
      return result;
    }
    return null;
  }

  return walk(obj, 0);
}

/**
 * Validate a request body against a schema.
 * Schema: { fieldName: { type, required, ...options } }
 * Returns { valid, errors, sanitized }
 */
function validateBody(body, schema) {
  const errors = [];
  const sanitized = {};

  for (const [field, rules] of Object.entries(schema)) {
    const raw = body?.[field];
    let result;

    switch (rules.type) {
      case 'string':
        result = validateString(raw, rules);
        break;
      case 'number':
        result = validateNumber(raw, rules);
        break;
      case 'boolean':
        if (raw === undefined || raw === null) {
          result = rules.required ? { valid: false, error: 'Field is required' } : { valid: true, value: null };
        } else if (!isBoolean(raw)) {
          result = { valid: false, error: 'Expected boolean' };
        } else {
          result = { valid: true, value: raw };
        }
        break;
      case 'enum':
        result = validateEnum(raw, rules.allowed, rules);
        break;
      case 'array':
        result = validateArray(raw, rules);
        break;
      case 'object':
        result = validateObject(raw, rules);
        break;
      default:
        result = { valid: true, value: raw };
    }

    if (!result.valid) {
      errors.push({ field, message: result.error });
    } else if (result.value !== undefined) {
      sanitized[field] = result.value;
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    sanitized,
  };
}

module.exports = {
  isString,
  isNumber,
  isBoolean,
  isObject,
  isArray,
  validateString,
  validateNumber,
  validateEnum,
  validateArray,
  validateObject,
  sanitizeString,
  sanitizeObject,
  validateBody,
};
