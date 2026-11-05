import { describe, expect, it } from "vitest";
import { buildApp } from "../src/app.js";
import { TestIntelligenceService, TestResult } from "../src/intelligence.js";

let sequence = 0;
function result(partial: Partial<TestResult> = {}): TestResult {
  sequence += 1;
  return {
    id: `run-${sequence}`,
    suite: "Checkout",
    name: `test-${sequence}`,
    status: "passed",
    durationMs: 1_000,
    commit: "abc1234",
    startedAt: new Date(1_760_000_000_000 + sequence * 1_000).toISOString(),
    ...partial
  };
}

function serviceWith(results: TestResult[]) {
  const service = new TestIntelligenceService();
  for (const item of results) service.record(item);
  return service;
}

describe("test intelligence and release assurance", () => {
  it("calculates pass rate from the latest result per test", () => {
    const service = serviceWith([
      result({ name: "a", status: "passed" }),
      result({ name: "b", status: "failed" }),
      result({ name: "c", status: "skipped" })
    ]);
    const summary = service.summary();
    expect(summary.total).toBe(3);
    expect(summary.passed).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.skipped).toBe(1);
    expect(summary.passRate).toBe(50);
  });

  it("uses the latest result when a test changes status", () => {
    const service = serviceWith([
      result({ name: "a", status: "failed", startedAt: "2026-11-06T09:00:00Z" }),
      result({ name: "a", status: "passed", startedAt: "2026-11-06T10:00:00Z" })
    ]);
    expect(service.summary().failed).toBe(0);
    expect(service.summary().passRate).toBe(100);
  });

  it("calculates p95 duration with nearest rank", () => {
    const results = Array.from({ length: 20 }, (_, index) =>
      result({ name: `p-${index}`, durationMs: (index + 1) * 100 })
    );
    expect(serviceWith(results).summary().p95DurationMs).toBe(1_900);
  });

  it("detects a flaky test across runs", () => {
    const service = serviceWith([
      result({ name: "flaky", status: "passed" }),
      result({ name: "flaky", status: "failed" })
    ]);
    const summary = service.summary();
    expect(summary.flakyTests).toHaveLength(1);
    expect(summary.flakyTests[0].name).toBe("flaky");
  });

  it("reports flake rate across distinct tests", () => {
    const results = Array.from({ length: 50 }, (_, index) => result({ name: `t-${index}` }));
    results.push(result({ name: "t-0", status: "failed", startedAt: new Date(1_760_000_000_000).toISOString() }));
    expect(serviceWith(results).summary().flakeRate).toBe(2);
  });

  it("opens the release gate when latest results pass and flakes are within budget", () => {
    const results = Array.from({ length: 50 }, (_, index) => result({ name: `t-${index}` }));
    results.push(result({ name: "t-0", status: "failed", startedAt: new Date(1_760_000_000_000).toISOString() }));
    const summary = serviceWith(results).summary();
    expect(summary.failed).toBe(0);
    expect(summary.flakeRate).toBe(2);
    expect(summary.releaseGate).toBe(true);
  });

  it("closes the release gate when the latest result fails", () => {
    const service = serviceWith([result({ name: "a", status: "failed" })]);
    expect(service.summary().releaseGate).toBe(false);
  });

  it("closes the release gate below 95% pass rate", () => {
    const results = Array.from({ length: 20 }, (_, index) => result({ name: `t-${index}`, status: index === 0 ? "failed" : "passed" }));
    expect(serviceWith(results).summary().releaseGate).toBe(false);
  });

  it("adds risk for failed tests", () => {
    const service = serviceWith([result({ name: "a", status: "failed" })]);
    expect(service.summary().riskScore).toBeGreaterThanOrEqual(10);
  });

  it("adds risk for flaky tests", () => {
    const service = serviceWith([
      result({ name: "a", status: "passed" }),
      result({ name: "a", status: "failed" })
    ]);
    expect(service.summary().riskScore).toBeGreaterThanOrEqual(15);
  });

  it("adds risk for high p95 duration", () => {
    const service = serviceWith([result({ name: "a", durationMs: 10_000 })]);
    expect(service.summary().riskScore).toBeGreaterThan(0);
  });

  it("groups results by suite", () => {
    const service = serviceWith([
      result({ suite: "Auth", name: "a" }),
      result({ suite: "Auth", name: "b" }),
      result({ suite: "Search", name: "c", status: "failed" })
    ]);
    expect(service.summary().suites).toHaveLength(2);
  });

  it("excludes skipped tests from pass rate", () => {
    const service = serviceWith([
      result({ name: "a", status: "passed" }),
      result({ name: "b", status: "skipped" })
    ]);
    expect(service.summary().passRate).toBe(100);
  });

  it("rejects duplicate test ids", () => {
    const service = new TestIntelligenceService();
    service.record(result({ id: "same" }));
    expect(() => service.record(result({ id: "same" }))).toThrow("duplicate");
  });

  it("rejects invalid status and duration", () => {
    const service = new TestIntelligenceService();
    expect(() => service.record(result({ status: "broken" as never }))).toThrow("invalid");
    expect(() => service.record(result({ durationMs: -1 }))).toThrow("duration");
  });

  it("rejects an invalid date", () => {
    const service = new TestIntelligenceService();
    expect(() => service.record(result({ startedAt: "not-a-date" }))).toThrow("startedAt");
  });

  it("returns a closed gate for an empty run", () => {
    const summary = new TestIntelligenceService().summary();
    expect(summary.releaseGate).toBe(false);
    expect(summary.total).toBe(0);
  });

  it("returns the recorded results", () => {
    const service = serviceWith([result({ name: "a" }), result({ name: "b" })]);
    expect(service.list()).toHaveLength(2);
  });

  it("computes suite pass rates", () => {
    const service = serviceWith([
      result({ suite: "Auth", name: "a" }),
      result({ suite: "Auth", name: "b", status: "failed" })
    ]);
    const auth = service.summary().suites.find((suite) => suite.suite === "Auth");
    expect(auth?.passRate).toBe(50);
  });

  it("serves results, summary and the dashboard", async () => {
    const service = new TestIntelligenceService();
    const app = buildApp(service);
    const created = await app.inject({ method: "POST", url: "/api/results", payload: result({ name: "a" }) });
    expect(created.statusCode).toBe(201);
    expect((await app.inject({ method: "GET", url: "/api/results" })).json()).toHaveLength(1);
    expect((await app.inject({ method: "GET", url: "/api/summary" })).json().total).toBe(1);
    const dashboard = await app.inject({ method: "GET", url: "/" });
    expect(dashboard.statusCode).toBe(200);
    expect(dashboard.body).toContain("Release Test Intelligence");
    expect(dashboard.body).toContain("#C9F777");
  });
});
