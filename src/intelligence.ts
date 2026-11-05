export type TestStatus = "passed" | "failed" | "skipped";

export interface TestResult {
  id: string;
  suite: string;
  name: string;
  status: TestStatus;
  durationMs: number;
  commit: string;
  startedAt: string;
}

export interface FlakyTest {
  name: string;
  suite: string;
  passes: number;
  failures: number;
  flakeRate: number;
}

export interface SuiteSummary {
  suite: string;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
}

export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  p95DurationMs: number;
  flakyTests: FlakyTest[];
  flakeRate: number;
  riskScore: number;
  releaseGate: boolean;
  suites: SuiteSummary[];
}

function round(value: number): number {
  return Math.round(value * 10) / 10;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

export class TestIntelligenceService {
  private readonly results: TestResult[] = [];

  record(result: TestResult): void {
    if (!result.id?.trim() || !result.suite?.trim() || !result.name?.trim()) {
      throw new Error("id, suite and name are required");
    }
    if (!["passed", "failed", "skipped"].includes(result.status)) throw new Error("invalid test status");
    if (!Number.isFinite(result.durationMs) || result.durationMs < 0) throw new Error("durationMs cannot be negative");
    if (Number.isNaN(Date.parse(result.startedAt))) throw new Error("startedAt must be a valid date");
    if (this.results.some((existing) => existing.id === result.id)) throw new Error("duplicate test id");
    this.results.push({ ...result });
  }

  list(): TestResult[] {
    return [...this.results];
  }

  summary(): TestSummary {
    const byName = new Map<string, TestResult[]>();
    for (const result of this.results) {
      const list = byName.get(result.name) ?? [];
      list.push(result);
      byName.set(result.name, list);
    }

    const latest = [...byName.values()].map((runs) =>
      [...runs].sort((a, b) => Date.parse(a.startedAt) - Date.parse(b.startedAt)).at(-1)!
    );
    const total = latest.length;
    const passed = latest.filter((result) => result.status === "passed").length;
    const failed = latest.filter((result) => result.status === "failed").length;
    const skipped = latest.filter((result) => result.status === "skipped").length;
    const executed = passed + failed;
    const passRate = executed === 0 ? 0 : round((passed / executed) * 100);
    const durations = this.results
      .filter((result) => result.status !== "skipped")
      .map((result) => result.durationMs)
      .sort((a, b) => a - b);
    const p95DurationMs = percentile(durations, 0.95);

    const flakyTests: FlakyTest[] = [];
    for (const [name, runs] of byName) {
      const passes = runs.filter((run) => run.status === "passed").length;
      const failures = runs.filter((run) => run.status === "failed").length;
      if (passes > 0 && failures > 0) {
        const executedRuns = passes + failures;
        flakyTests.push({
          name,
          suite: runs[0].suite,
          passes,
          failures,
          flakeRate: round((failures / executedRuns) * 100)
        });
      }
    }
    flakyTests.sort((a, b) => b.flakeRate - a.flakeRate);

    const flakeRate = total === 0 ? 0 : round((flakyTests.length / total) * 100);
    const riskScore = Math.min(
      100,
      Math.round(failed * 10 + flakyTests.length * 15 + Math.max(0, 95 - passRate) * 5 + Math.max(0, p95DurationMs - 5_000) / 100)
    );
    const releaseGate = total > 0 && passed > 0 && failed === 0 && passRate >= 95 && flakeRate <= 2;

    const suites = [...new Set(this.results.map((result) => result.suite))].sort().map((suite) => {
      const runs = this.results.filter((result) => result.suite === suite);
      const suitePassed = runs.filter((run) => run.status === "passed").length;
      const suiteFailed = runs.filter((run) => run.status === "failed").length;
      const suiteSkipped = runs.filter((run) => run.status === "skipped").length;
      return {
        suite,
        passed: suitePassed,
        failed: suiteFailed,
        skipped: suiteSkipped,
        passRate: suitePassed + suiteFailed === 0 ? 0 : round((suitePassed / (suitePassed + suiteFailed)) * 100)
      };
    });

    return {
      total,
      passed,
      failed,
      skipped,
      passRate,
      p95DurationMs,
      flakyTests,
      flakeRate,
      riskScore,
      releaseGate,
      suites
    };
  }
}