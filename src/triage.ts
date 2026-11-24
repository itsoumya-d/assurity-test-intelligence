export type JourneyType =
  | 'checkout'
  | 'giving_flow'
  | 'authentication'
  | 'payment_processing'
  | 'profile'
  | 'reporting'
  | 'general';

export type FailureCategory =
  | 'BACKEND_FAULT'
  | 'SELECTOR_OR_DOM_DRIFT'
  | 'NETWORK_OR_TIMEOUT'
  | 'RACE_CONDITION'
  | 'BUSINESS_LOGIC_ASSERTION';

export type DefectSeverity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';

export interface ExecutionTrace {
  testId: string;
  testName: string;
  suite: string;
  journey?: JourneyType;
  errorMessage: string;
  stackTrace?: string;
  httpStatus?: number;
  durationMs: number;
  retryCount?: number;
  hasPassedOnRetry?: boolean;
}

export interface TriageDefectCard {
  testId: string;
  testName: string;
  suite: string;
  category: FailureCategory;
  severity: DefectSeverity;
  customerImpactScore: number;
  hypothesis: string;
  investigationGuidance: string[];
  recommendedAction: string;
}

export interface TriageBatchSummary {
  totalAnalyzed: number;
  criticalDefects: number;
  highDefects: number;
  mediumDefects: number;
  lowDefects: number;
  byCategory: Record<FailureCategory, number>;
  cards: TriageDefectCard[];
}

const JOURNEY_WEIGHTS: Record<JourneyType, number> = {
  giving_flow: 98,
  payment_processing: 95,
  checkout: 92,
  authentication: 90,
  profile: 65,
  reporting: 50,
  general: 40,
};

export function classifyExecutionFailure(trace: ExecutionTrace): TriageDefectCard {
  const err = (trace.errorMessage || '').toLowerCase();
  const stack = (trace.stackTrace || '').toLowerCase();
  const journey = trace.journey || 'general';
  const journeyBaseScore = JOURNEY_WEIGHTS[journey] || 50;

  let category: FailureCategory;
  let hypothesis = '';
  let guidance: string[] = [];
  let action = '';

  // 1. Race condition (passed on retry with timing anomaly)
  if ((trace.retryCount && trace.retryCount > 0 && trace.hasPassedOnRetry) || err.includes('flaky') || (err.includes('timeout') && trace.retryCount && trace.retryCount > 0)) {
    category = 'RACE_CONDITION';
    hypothesis = 'Asynchronous timing race condition: assertion evaluated before background state mutation finalized.';
    guidance = [
      'Inspect network trace for delayed async dispatch or Promise resolution.',
      'Replace hard sleep with deterministic locator event polling or state waiter.',
      'Audit database transaction boundary and isolation level during parallel suite execution.',
    ];
    action = 'Refactor test to await explicit signal/locator state instead of relying on implicit timeouts.';
  }
  // 2. Network or gateway timeout (502, 504, network partition)
  else if (
    trace.httpStatus === 504 ||
    trace.httpStatus === 502 ||
    err.includes('504 gateway timeout') ||
    err.includes('502 bad gateway') ||
    err.includes('socket hang up') ||
    err.includes('etimedout')
  ) {
    category = 'NETWORK_OR_TIMEOUT';
    hypothesis = 'Network routing partition or proxy/gateway timeout between client and service layer.';
    guidance = [
      'Check API gateway proxy timeout thresholds (typically 30s-60s).',
      'Correlate with infrastructure latency spikes or SRE telemetry.',
      'Audit ingress controller connection limits and TLS handshake times.',
    ];
    action = 'Verify network transit latency and SRE gateway error metrics for that execution window.';
  }
  // 3. Backend service fault (500, 503, database, connection refused)
  else if (
    (trace.httpStatus && trace.httpStatus >= 500) ||
    err.includes('500 internal server error') ||
    err.includes('database deadlock') ||
    err.includes('connection refused') ||
    stack.includes('econnrefused')
  ) {
    category = 'BACKEND_FAULT';
    hypothesis = 'Downstream backend exception or database constraint failure during request execution.';
    guidance = [
      'Inspect application service logs for unhandled exception or 5xx stack trace.',
      'Verify database transaction locks, migrations, and foreign key integrity.',
      'Check whether downstream mock or dependency service was healthy during run.',
    ];
    action = 'File high-priority engineering defect with correlated backend service trace ID.';
  }
  // 4. Playwright / UI locator selector drift
  else if (
    err.includes('waiting for locator') ||
    err.includes('waiting for selector') ||
    err.includes('element is not visible') ||
    err.includes('strict mode violation') ||
    err.includes('element handle is detached')
  ) {
    category = 'SELECTOR_OR_DOM_DRIFT';
    hypothesis = 'Front-end DOM mutation: UI component selector drifted, re-rendered, or unmounted prematurely.';
    guidance = [
      'Inspect recent front-end pull requests modifying this component or page template.',
      'Verify whether data-testid attribute was removed or renamed in client markup.',
      'Review DOM snapshot artifact for conditional rendering flags or error modal overlays.',
    ];
    action = 'Standardize locator to stable data-testid attribute and confirm DOM mounting lifecycle.';
  }
  // 5. Business logic assertion failure
  else {
    category = 'BUSINESS_LOGIC_ASSERTION';
    hypothesis = 'Business rule or payload assertion mismatch: actual response diverged from expected functional contract.';
    guidance = [
      'Compare expected vs received JSON diff for field discrepancy.',
      'Verify whether product specifications or pricing/tax rules changed intentionally.',
      'Review test fixture seed data for stale mock assumptions.',
    ];
    action = 'Validate functional requirement with product lead and update test contract if intentional.';
  }

  // Derive Severity from Customer Impact & Category
  let severity: DefectSeverity = 'LOW';
  let impactScore = journeyBaseScore;

  if (category === 'BACKEND_FAULT') {
    impactScore = Math.min(100, journeyBaseScore + 5);
  } else if (category === 'RACE_CONDITION') {
    impactScore = Math.max(10, journeyBaseScore - 15);
  }

  if (impactScore >= 90) {
    severity = 'CRITICAL';
  } else if (impactScore >= 75) {
    severity = 'HIGH';
  } else if (impactScore >= 55) {
    severity = 'MEDIUM';
  } else {
    severity = 'LOW';
  }

  return {
    testId: trace.testId,
    testName: trace.testName,
    suite: trace.suite,
    category,
    severity,
    customerImpactScore: impactScore,
    hypothesis,
    investigationGuidance: guidance,
    recommendedAction: action,
  };
}

export function triageBatch(traces: ExecutionTrace[]): TriageBatchSummary {
  const cards = traces.map(classifyExecutionFailure);
  const byCategory: Record<FailureCategory, number> = {
    BACKEND_FAULT: 0,
    SELECTOR_OR_DOM_DRIFT: 0,
    NETWORK_OR_TIMEOUT: 0,
    RACE_CONDITION: 0,
    BUSINESS_LOGIC_ASSERTION: 0,
  };

  let critical = 0;
  let high = 0;
  let medium = 0;
  let low = 0;

  for (const c of cards) {
    byCategory[c.category] = (byCategory[c.category] || 0) + 1;
    if (c.severity === 'CRITICAL') critical++;
    else if (c.severity === 'HIGH') high++;
    else if (c.severity === 'MEDIUM') medium++;
    else low++;
  }

  return {
    totalAnalyzed: cards.length,
    criticalDefects: critical,
    highDefects: high,
    mediumDefects: medium,
    lowDefects: low,
    byCategory,
    cards,
  };
}
