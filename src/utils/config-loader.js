const fs = require('fs');
const path = require('path');

const DEFAULT_SEARCH_PATHS = [
  './aeb.config.json',
  './aeb.config.js',
  '~/.aeb/config.json',
];

function expandHome(filepath) {
  if (filepath.startsWith('~/') || filepath.startsWith('~\\')) {
    return path.join(process.env.HOME || process.env.USERPROFILE || '.', filepath.slice(2));
  }
  return filepath;
}

function loadConfigFile(filepath) {
  const resolved = path.resolve(expandHome(filepath));
  if (!fs.existsSync(resolved)) {
    return null;
  }

  const ext = path.extname(resolved);
  if (ext === '.json') {
    const raw = fs.readFileSync(resolved, 'utf8');
    return JSON.parse(raw);
  }

  if (ext === '.js' || ext === '.cjs') {
    delete require.cache[require.resolve(resolved)];
    return require(resolved);
  }

  throw new Error(`Unsupported config file extension: ${ext}`);
}

function loadConfig(options = {}) {
  const searchPaths = options.paths || DEFAULT_SEARCH_PATHS;
  const explicitPath = options.configPath || process.env.AEB_CONFIG_PATH;

  if (explicitPath) {
    return loadConfigFile(explicitPath);
  }

  for (const candidate of searchPaths) {
    const config = loadConfigFile(candidate);
    if (config !== null) {
      return config;
    }
  }

  return null;
}

module.exports = {
  loadConfig,
  loadConfigFile,
  DEFAULT_SEARCH_PATHS,
};
