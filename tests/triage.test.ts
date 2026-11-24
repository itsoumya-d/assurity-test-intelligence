import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { TestIntelligenceService } from '../src/intelligence.js';
import {
  classifyExecutionFailure,
  triageBatch,
  ExecutionTrace,
} from '../src/triage.js';

describe('E2E Failure Root-Cause Classifier and Triage Hypothesis Generator', () => {
  it('classifies HTTP 500 in giving flow as critical backend fault', () => {
    const trace: ExecutionTrace = {
      testId: 'test-give-001',
      testName: 'CompleteRecurringDonationFlow',
      suite: 'E2E-Donations',
      journey: 'giving_flow',
      errorMessage: '500 Internal Server Error: unhandled database deadlock during transaction commit',
      httpStatus: 500,
      durationMs: 3450,
      retryCount: 0,
    };

    const card = classifyExecutionFailure(trace);
    expect(card.category).toBe('BACKEND_FAULT');
    expect(card.severity).toBe('CRITICAL');
    expect(card.customerImpactScore).toBeGreaterThanOrEqual(95);
    expect(card.hypothesis).toContain('backend exception');
    expect(card.investigationGuidance.length).toBeGreaterThan(0);
  });

  it('classifies Playwright locator timeout as front-end selector drift', () => {
    const trace: ExecutionTrace = {
      testId: 'test-ui-002',
      testName: 'NavigateMemberProfileSettings',
      suite: 'UI-Profile',
      journey: 'profile',
      errorMessage: 'Timeout 30000ms exceeded waiting for locator("button#submit-profile")',
      durationMs: 30000,
      retryCount: 0,
    };

    const card = classifyExecutionFailure(trace);
    expect(card.category).toBe('SELECTOR_OR_DOM_DRIFT');
    expect(card.hypothesis).toContain('DOM mutation');
    expect(card.recommendedAction).toContain('data-testid');
    expect(card.severity).toBe('MEDIUM');
  });

  it('classifies retry pass with timing anomaly as race condition', () => {
    const trace: ExecutionTrace = {
      testId: 'test-auth-003',
      testName: 'SessionTokenRefreshOnVisibilityChange',
      suite: 'E2E-Auth',
      journey: 'authentication',
      errorMessage: 'Assertion failed: expected token to be defined within 50ms',
      durationMs: 820,
      retryCount: 1,
      hasPassedOnRetry: true,
    };

    const card = classifyExecutionFailure(trace);
    expect(card.category).toBe('RACE_CONDITION');
    expect(card.hypothesis).toContain('timing race condition');
    expect(card.investigationGuidance.some((g) => g.includes('polling'))).toBe(true);
  });

  it('classifies gateway 504 as network timeout', () => {
    const trace: ExecutionTrace = {
      testId: 'test-net-004',
      testName: 'ExportFiscalYearDonationSummary',
      suite: 'Reports-API',
      journey: 'reporting',
      errorMessage: 'Fetch failed: 504 Gateway Timeout from api.gateway.internal',
      httpStatus: 504,
      durationMs: 60100,
    };

    const card = classifyExecutionFailure(trace);
    expect(card.category).toBe('NETWORK_OR_TIMEOUT');
    expect(card.hypothesis).toContain('Network routing partition');
  });

  it('classifies functional payload discrepancy as business logic assertion failure', () => {
    const trace: ExecutionTrace = {
      testId: 'test-biz-005',
      testName: 'TaxDeductibleReceiptCalculation',
      suite: 'Finance-Rules',
      journey: 'payment_processing',
      errorMessage: 'AssertionError: expected receiptTotal to equal 125.00 but received 115.00',
      durationMs: 450,
      retryCount: 0,
    };

    const card = classifyExecutionFailure(trace);
    expect(card.category).toBe('BUSINESS_LOGIC_ASSERTION');
    expect(card.hypothesis).toContain('payload assertion mismatch');
  });

  it('aggregates batch triage summary across multiple failures', () => {
    const batch: ExecutionTrace[] = [
      {
        testId: 't1',
        testName: 'DonateCheckout',
        suite: 'Giving',
        journey: 'giving_flow',
        errorMessage: '500 Server Error',
        httpStatus: 500,
        durationMs: 1200,
      },
      {
        testId: 't2',
        testName: 'ClickDropdown',
        suite: 'UI',
        journey: 'profile',
        errorMessage: 'waiting for locator button.dropdown',
        durationMs: 5000,
      },
      {
        testId: 't3',
        testName: 'AuthToken',
        suite: 'Auth',
        journey: 'authentication',
        errorMessage: 'flaky race condition',
        retryCount: 2,
        hasPassedOnRetry: true,
        durationMs: 900,
      },
    ];

    const summary = triageBatch(batch);
    expect(summary.totalAnalyzed).toBe(3);
    expect(summary.byCategory.BACKEND_FAULT).toBe(1);
    expect(summary.byCategory.SELECTOR_OR_DOM_DRIFT).toBe(1);
    expect(summary.byCategory.RACE_CONDITION).toBe(1);
    expect(summary.criticalDefects).toBe(1);
  });

  it('serves classify and batch triage through Fastify HTTP routes', async () => {
    const service = new TestIntelligenceService();
    const app = buildApp(service);

    const singleResponse = await app.inject({
      method: 'POST',
      url: '/api/triage/classify',
      payload: {
        testId: 'api-triage-1',
        testName: 'PaymentGatewayCheckout',
        suite: 'Payments',
        journey: 'checkout',
        errorMessage: '500 Internal Server Error in payment intent processing',
        httpStatus: 500,
        durationMs: 1500,
      },
    });

    expect(singleResponse.statusCode).toBe(200);
    const card = JSON.parse(singleResponse.body);
    expect(card.category).toBe('BACKEND_FAULT');
    expect(card.severity).toBe('CRITICAL');

    const batchResponse = await app.inject({
      method: 'POST',
      url: '/api/triage/batch',
      payload: [
        {
          testId: 'b1',
          testName: 'PayIntent',
          suite: 'Payments',
          journey: 'payment_processing',
          errorMessage: '500 Server Error',
          httpStatus: 500,
          durationMs: 1100,
        },
      ],
    });

    expect(batchResponse.statusCode).toBe(200);
    const batchData = JSON.parse(batchResponse.body);
    expect(batchData.totalAnalyzed).toBe(1);
    expect(batchData.criticalDefects).toBe(1);
  });
});
