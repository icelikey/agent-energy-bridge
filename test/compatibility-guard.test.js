const test = require('node:test');
const assert = require('node:assert/strict');
const { CompatibilityGuard } = require('../src');

test('CompatibilityGuard preserves existing routes by default and only emits shadow recommendations', () => {
  const guard = new CompatibilityGuard();
  const plan = guard.planRoute(
    { currentRoute: 'legacy-premium-route' },
    { primary: { id: 'gpt-5-codex' } },
  );

  assert.equal(plan.mode, 'preserve_existing_route');
  assert.equal(plan.activeRoute, 'legacy-premium-route');
  assert.equal(plan.shadowRecommendation, 'gpt-5-codex');
  assert.equal(plan.shouldProvisionRoute, false);
});

test('CompatibilityGuard reuses existing keys by default', () => {
  const guard = new CompatibilityGuard();
  const plan = guard.planKey({ existingKey: { apiKey: 'ak-existing' } }, { owner: 'brave' });

  assert.equal(plan.action, 'reuse_existing_key');
  assert.equal(plan.shouldIssueKey, false);
  assert.equal(plan.existingKey.apiKey, 'ak-existing');
});

test('CompatibilityGuard can provision a new namespaced route only when explicitly allowed', () => {
  const guard = new CompatibilityGuard({ routingMode: 'provision' });
  const plan = guard.planRoute(
    { allowRouteProvisioning: true },
    { primary: { id: 'all-protocol-router' } },
  );

  assert.equal(plan.mode, 'provision_new_route');
  assert.equal(plan.activeRoute, 'aeb-all-protocol-router');
  assert.equal(plan.shouldProvisionRoute, true);
});
