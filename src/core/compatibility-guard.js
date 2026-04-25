function slugify(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

class CompatibilityGuard {
  constructor(options = {}) {
    this.protectExistingRoutes = options.protectExistingRoutes !== false;
    this.protectExistingKeys = options.protectExistingKeys !== false;
    this.routingMode = options.routingMode ?? 'advisory';
    this.routeNamespace = options.routeNamespace ?? 'aeb';
  }

  planRoute(context = {}, recommendation = {}) {
    const existingRoute = context.currentRoute ?? context.routeName ?? context.group ?? null;
    const proposedRoute = context.proposedRoute ?? recommendation.primary?.id ?? recommendation.primary?.label ?? null;

    if (this.protectExistingRoutes && existingRoute) {
      return {
        mode: 'preserve_existing_route',
        activeRoute: existingRoute,
        proposedRoute,
        shadowRecommendation: proposedRoute,
        shouldProvisionRoute: false,
        reasons: ['existing route protection is enabled'],
      };
    }

    if (this.routingMode === 'advisory' || context.allowRouteProvisioning !== true) {
      return {
        mode: 'advisory_only',
        activeRoute: existingRoute,
        proposedRoute,
        shadowRecommendation: proposedRoute,
        shouldProvisionRoute: false,
        reasons: ['route changes are advisory by default'],
      };
    }

    const provisionedRoute = context.newRouteName || this.buildNamespacedRouteName(proposedRoute || 'recommended-route');

    return {
      mode: 'provision_new_route',
      activeRoute: provisionedRoute,
      proposedRoute,
      shadowRecommendation: proposedRoute,
      shouldProvisionRoute: true,
      reasons: [],
    };
  }

  planKey(context = {}, identity = {}) {
    const existingKey = context.existingKey ?? context.currentKey ?? null;

    if (this.protectExistingKeys && existingKey) {
      return {
        action: 'reuse_existing_key',
        shouldIssueKey: false,
        existingKey,
        owner: identity.owner ?? context.identity?.owner ?? 'system',
        reasons: ['existing key protection is enabled'],
      };
    }

    return {
      action: 'issue_new_key',
      shouldIssueKey: true,
      existingKey: null,
      owner: identity.owner ?? context.identity?.owner ?? 'system',
      reasons: [],
    };
  }

  buildNamespacedRouteName(routeName) {
    const slug = slugify(routeName || 'route');
    return `${this.routeNamespace}-${slug}`;
  }

  snapshot() {
    return {
      protectExistingRoutes: this.protectExistingRoutes,
      protectExistingKeys: this.protectExistingKeys,
      routingMode: this.routingMode,
      routeNamespace: this.routeNamespace,
    };
  }
}

module.exports = {
  CompatibilityGuard,
};
