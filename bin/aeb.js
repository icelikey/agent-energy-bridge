#!/usr/bin/env node

const path = require('path');
const {
  BudgetGuard,
  ModelSelector,
  EnergyEngine,
  CompatibilityGuard,
  ReferralEngine,
  MemoryAdapter,
  SessionStore,
  startServer,
  loadConfig,
} = require('../src');

const pkg = require('../package.json');

function printUsage() {
  console.log(`Agent Energy Bridge CLI v${pkg.version}
`);
  console.log('Usage: aeb <command> [options]\n');
  console.log('Commands:');
  console.log('  start          Start the HTTP server');
  console.log('  recommend      Get a model recommendation');
  console.log('  optimize       Evaluate budget and get optimization advice');
  console.log('  test           Run the test suite');
  console.log('  check          Verify module exports');
  console.log('  version        Show version');
  console.log('  help           Show this help\n');
  console.log('Environment:');
  console.log('  AEB_PORT         Server port (default: 3100)');
  console.log('  AEB_HOST         Server host (default: 127.0.0.1)');
  console.log('  AEB_LOG_LEVEL    Log level (debug|info|warn|error)');
  console.log('  AEB_CONFIG_PATH  Path to config file');
}

function buildFromConfig(config = {}) {
  const adapter = config.adapter
    ? new (require(path.resolve(config.adapter)))(config.adapterOptions)
    : new MemoryAdapter(config.memoryAdapter || {});

  const budgetGuard = new BudgetGuard(config.budgetGuard || {});
  const modelSelector = new ModelSelector(config.modelCatalog, config.modelSelector);
  const energyEngine = config.energyEngine !== false ? new EnergyEngine() : null;
  const sessionStore = config.sessionStore !== false ? new SessionStore(config.sessionStore) : null;
  const compatibilityGuard = new CompatibilityGuard(config.compatibilityGuard);
  const referralEngine = new ReferralEngine(config.referralEngine);

  return {
    adapter,
    budgetGuard,
    modelSelector,
    energyEngine,
    sessionStore,
    compatibilityGuard,
    referralEngine,
  };
}

async function cmdStart() {
  const config = loadConfig() || {};
  const components = buildFromConfig(config);

  await startServer({
    ...components,
    port: process.env.AEB_PORT || config.port,
    host: process.env.AEB_HOST || config.host,
    onReady: ({ port, host }) => {
      console.log(`Agent Energy Bridge server running at http://${host}:${port}`);
      console.log(`Health check: http://${host}:${port}/agent/v1/health`);
    },
    onError: (error) => {
      console.error('Server failed to start:', error.message);
      process.exit(1);
    },
  });
}

function cmdRecommend(args) {
  const taskType = args[0] || 'chat';
  const budgetTier = args[1] || 'balanced';
  const protocol = args[2] || 'openai';

  const selector = new ModelSelector();
  const result = selector.recommend({ taskType, budgetTier, protocol });

  console.log(`Task: ${taskType} | Budget: ${budgetTier} | Protocol: ${protocol}`);
  console.log(`Primary:   ${result.primary?.id || 'none'}`);
  console.log(`Fallback:  ${result.fallback?.id || 'none'}`);
  console.log(`\n${result.explain}`);
}

function cmdOptimize(args) {
  const estimatedCostUsd = Number(args[0] || 1);
  const requestedTokens = Number(args[1] || 5000);
  const budgetTier = args[2] || 'balanced';

  const budgetGuard = new BudgetGuard({ dailyBudgetUsd: 10, hourlyTokenLimit: 100000 });
  const selector = new ModelSelector();
  const recommendation = selector.recommend({ budgetTier });

  const guard = budgetGuard.evaluateUsage({
    model: recommendation.primary?.id,
    estimatedCostUsd,
    requestedTokens,
    dailySpentUsd: 2,
    hourlyTokensUsed: 10000,
    modelPricePer1kUsd: recommendation.primary?.pricePer1kUsd || 0,
    fallbackModel: recommendation.fallback?.id,
  });

  console.log(`Estimated: $${estimatedCostUsd} | Tokens: ${requestedTokens}`);
  console.log(`Action: ${guard.allowed ? 'PROCEED' : 'BLOCK / DOWNGRADE'}`);
  console.log(`Fallback: ${guard.fallbackModel || 'none'}`);
  if (guard.reasons.length) {
    console.log(`Reasons: ${guard.reasons.join('; ')}`);
  }
}

function cmdTest() {
  const { execSync } = require('child_process');
  try {
    execSync('node --test', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  } catch {
    process.exit(1);
  }
}

function cmdCheck() {
  const bridge = require('../src');
  const keys = Object.keys(bridge).sort();
  console.log('Exported modules:');
  keys.forEach((k) => console.log(`  - ${k}`));
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0] || 'help';

  switch (command) {
    case 'start':
      cmdStart();
      break;
    case 'recommend':
      cmdRecommend(args.slice(1));
      break;
    case 'optimize':
      cmdOptimize(args.slice(1));
      break;
    case 'test':
      cmdTest();
      break;
    case 'check':
      cmdCheck();
      break;
    case 'version':
      console.log(pkg.version);
      break;
    case 'help':
    default:
      printUsage();
      process.exit(command === 'help' ? 0 : 1);
  }
}

main();
