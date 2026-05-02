export interface BudgetPolicy {
  dailyBudgetUsd?: number;
  hourlyTokenLimit?: number;
  maxAutoRefuelsPerDay?: number;
  maxRefuelAmountUsd?: number;
  maxAutoPurchasedUsdPerDay?: number;
  expensiveModelAllowlist?: string[];
  expensiveModelPriceThresholdUsdPer1k?: number;
  fallbackModel?: string | null;
  autoPurchaseEnabled?: boolean;
}

export interface UsageInput {
  requestedTokens?: number;
  estimatedCostUsd?: number;
  dailySpentUsd?: number;
  hourlyTokensUsed?: number;
  modelPricePer1kUsd?: number;
  model?: string;
  fallbackModel?: string | null;
}

export interface GuardDecision {
  allowed: boolean;
  action: 'allow' | 'downgrade' | 'block';
  reasons: string[];
  fallbackModel: string | null;
  projectedSpendUsd: number;
  projectedHourlyTokens: number;
}

export interface AutoRefuelResult {
  allowed: boolean;
  approvedAmountUsd: number;
  reasons: string[];
  remainingAutoPurchaseUsd: number;
}

export class BudgetGuard {
  constructor(policy?: BudgetPolicy);
  evaluateUsage(input?: UsageInput): GuardDecision;
  evaluateAutoRefuel(input?: { requestedAmountUsd?: number; refuelsToday?: number; autoPurchasedUsdToday?: number }): AutoRefuelResult;
  snapshot(): BudgetPolicy;
}

export interface CompatibilityOptions {
  protectExistingRoutes?: boolean;
  protectExistingKeys?: boolean;
  routingMode?: 'advisory' | 'active';
  routeNamespace?: string;
}

export interface RoutePlan {
  mode: string;
  activeRoute: string | null;
  proposedRoute: string | null;
  shadowRecommendation: string | null;
  shouldProvisionRoute: boolean;
  reasons: string[];
}

export interface KeyPlan {
  action: string;
  shouldIssueKey: boolean;
  existingKey: any;
  owner: string;
  reasons: string[];
}

export class CompatibilityGuard {
  constructor(options?: CompatibilityOptions);
  planRoute(context?: object, recommendation?: object): RoutePlan;
  planKey(context?: object, identity?: object): KeyPlan;
  buildNamespacedRouteName(routeName: string): string;
  snapshot(): CompatibilityOptions;
}

export interface SessionData {
  taskType?: string;
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
  qualityScore?: number;
  success?: number;
  successRate?: number;
  latencyMs?: number;
  costUsd?: number;
  tokenBudget?: number;
  costBudgetUsd?: number;
  firstPassSuccess?: boolean;
  model?: string;
}

export interface ScoredSession {
  taskType: string;
  model: string;
  totalTokens: number;
  costUsd: number;
  qualityScore: number;
  successScore: number;
  latencyScore: number;
  energyScore: number;
}

export interface SessionSummary {
  sessions: number;
  totalTokens: number;
  totalCostUsd: number;
  avgEnergyScore: number;
  avgSuccessScore: number;
  trend: 'up' | 'down' | 'flat';
  suggestions: string[];
}

export class EnergyEngine {
  scoreSession(session?: SessionData): ScoredSession;
  summarizeSession(sessions?: SessionData[] | ScoredSession[]): SessionSummary;
}

export interface BenchmarkProfile {
  [dimension: string]: number;
}

export interface TaskProfile {
  [dimension: string]: number;
}

export interface ModelAssessment {
  modelId: string;
  taskWeights: Record<string, number>;
  taskFitScore: number;
  capabilityCoverage: number;
  protocolFit: number;
  budgetFit: number;
  speedScore: number;
  stabilityScore: number;
  costEfficiencyScore: number;
  qualityComposite: number;
  weightedScore: number;
  dimensionScores: Record<string, number>;
}

export class ModelCapabilityBenchmark {
  constructor(benchmarkMap?: Record<string, BenchmarkProfile>);
  getProfile(model: string | object): BenchmarkProfile;
  evaluateModel(model: object, workload?: object): ModelAssessment;
  evaluatePortfolio(models: object[], workload?: object): Array<{ model: object; assessment: ModelAssessment }>;
  recommendWorkflow(models: object[], tasks?: object[], sharedContext?: object): object;
}

export const DEFAULT_MODEL_BENCHMARKS: Record<string, BenchmarkProfile>;
export const TASK_PROFILES: Record<string, TaskProfile>;

export interface ModelCatalogEntry {
  id: string;
  label: string;
  provider: string;
  budgetTier: string;
  qualityTier: string;
  pricePer1kUsd: number;
  protocols: string[];
  capabilities: string[];
}

export interface Recommendation {
  primary: ModelCatalogEntry | null;
  fallback: ModelCatalogEntry | null;
  candidates: Array<ModelCatalogEntry & { baseScore: number; score: number; capabilityAssessment: ModelAssessment }>;
  explain: string;
}

export class ModelSelector {
  constructor(catalog?: ModelCatalogEntry[], options?: object);
  listCatalog(filters?: { protocol?: string; budgetTier?: string }): ModelCatalogEntry[];
  recommend(input?: object): Recommendation;
  recommendWorkflow(tasks?: object[], sharedInput?: object): object;
  scoreCandidate(model: object, input?: object): number;
  scoreQualityFit(model: object, qualityPriority?: string): number;
}

export const MODEL_CATALOG: ModelCatalogEntry[];

export interface ReferralOffer {
  title: string;
  tagLine: string;
  brandLabel: string;
  routeName: string;
  purchaseUrl: string;
  docsUrl: string;
  allowedModels: string[];
  guardrails: string[];
  contact: string;
  referralCode: string | null;
  markdown: string;
}

export class ReferralEngine {
  constructor(options?: object);
  buildOffer(input?: object): ReferralOffer;
}

export class GatewayAdapter {
  listModels(): Promise<any>;
  getUsage(identity?: object): Promise<any>;
  getBalance(identity?: object): Promise<any>;
  redeemCode(payload?: object): Promise<any>;
  issueKey(payload?: object): Promise<any>;
  rotateKey(payload?: object): Promise<any>;
  renderDocs(payload?: object): Promise<any>;
}

export interface GenericAdapterConfig {
  baseUrl: string;
  apiKey?: string;
  transport?: (args: object) => Promise<any>;
  paths?: Partial<typeof DEFAULT_PATHS>;
}

export const DEFAULT_PATHS: {
  models: string;
  usage: string;
  balance: string;
  redeem: string;
  issueKey: string;
  rotateKey: string;
  docs: string;
};

export class GenericOpenAIGatewayAdapter extends GatewayAdapter {
  constructor(config: GenericAdapterConfig);
  request(args: { method?: string; path?: string; query?: object; body?: object; headers?: object }): Promise<any>;
  listModels(): Promise<any>;
  getUsage(identity?: object): Promise<any>;
  getBalance(identity?: object): Promise<any>;
  redeemCode(payload?: object): Promise<any>;
  issueKey(payload?: object): Promise<any>;
  rotateKey(payload?: object): Promise<any>;
  renderDocs(payload?: object): Promise<any>;
}

export interface MemoryAdapterOptions {
  balanceUsd?: number;
  dailySpentUsd?: number;
  hourlyTokensUsed?: number;
  autoRefuelsToday?: number;
  autoPurchasedUsdToday?: number;
  codes?: Record<string, number>;
  docsTemplates?: Record<string, (data: object) => string>;
}

export class MemoryAdapter extends GatewayAdapter {
  constructor(options?: MemoryAdapterOptions);
}

export class SessionStore {
  constructor(options?: { maxSize?: number });
  addSession(scoredSession: ScoredSession): number;
  getRecentSessions(limit?: number): ScoredSession[];
  getSessionsByTaskType(taskType: string, limit?: number): ScoredSession[];
  getSessionsByModel(model: string, limit?: number): ScoredSession[];
  clear(): void;
  size(): number;
}

export interface OrchestratorOptions {
  adapter: GatewayAdapter;
  budgetGuard: BudgetGuard;
  modelSelector: ModelSelector;
  compatibilityGuard?: CompatibilityGuard;
  energyEngine?: EnergyEngine | null;
  sessionStore?: SessionStore | null;
  lowBalanceThresholdUsd?: number;
  defaultIssuePlan?: string;
  defaultDocsTemplate?: string;
}

export interface SessionResult {
  status: 'ready' | 'blocked';
  selectedModel: string | null;
  recommendation: Recommendation;
  routingPlan: RoutePlan;
  guardDecision: GuardDecision;
  usage: any;
  balance: any;
  refuel: any;
  energyInsights: any;
}

export class RefuelOrchestrator {
  constructor(options: OrchestratorOptions);
  prepareSession(context?: object): Promise<SessionResult>;
  handleLowBalance(args: object): Promise<any>;
  provisionAccess(context?: object): Promise<any>;
  reportSession(session: SessionData): ScoredSession;
  getSessionSummary(filters?: { taskType?: string; model?: string; limit?: number }): SessionSummary;
}

export interface ServerContext {
  adapter?: GatewayAdapter | null;
  budgetGuard?: BudgetGuard | null;
  modelSelector?: ModelSelector | null;
  energyEngine?: EnergyEngine | null;
  sessionStore?: SessionStore | null;
  compatibilityGuard?: CompatibilityGuard | null;
  referralEngine?: ReferralEngine | null;
}

export interface StartServerOptions extends ServerContext {
  port?: number | string;
  host?: string;
  onReady?: (info: { port: number; host: string }) => void;
  onError?: (error: Error) => void;
}

export function createServer(options?: ServerContext): import('http').Server;
export function startServer(options?: StartServerOptions): Promise<import('http').Server>;
export function buildContext(options?: ServerContext): ServerContext;

export const LEVELS: Record<string, number>;

export class Logger {
  constructor(options?: { namespace?: string; level?: string; sink?: { write: (line: string) => void } });
  debug(message: string, meta?: object): void;
  info(message: string, meta?: object): void;
  warn(message: string, meta?: object): void;
  error(message: string, meta?: object): void;
}

export function loadConfig(options?: { paths?: string[]; configPath?: string }): object | null;
export function loadConfigFile(filepath: string): object | null;
export const DEFAULT_SEARCH_PATHS: string[];
