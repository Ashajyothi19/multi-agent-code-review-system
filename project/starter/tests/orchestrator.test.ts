import { describe, it, expect, vi, beforeEach } from 'vitest';

// `mock`-prefixed names are exempt from vitest's hoisting restriction,
// so this can be referenced inside the vi.mock factory below.
const mockQuery = vi.fn();

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({
  query: (...args: unknown[]) => mockQuery(...args),
}));

import { CodeReviewOrchestrator } from '../src/orchestrator';

/**
 * A minimal but fully valid ReviewReport, matching ReviewReportSchema.
 */
const validReport = {
  pullRequest: { owner: 'airaamane', repo: 'simple-todo-app', number: 1 },
  fileReviews: [
    {
      file: 'src/app.ts',
      codeQuality: {
        file: 'src/app.ts',
        issues: [],
        overallScore: 90,
        summary: 'Looks clean.',
      },
      testCoverage: {
        file: 'src/app.ts',
        hasTests: true,
        testFiles: ['tests/app.test.ts'],
        untestedPaths: [],
        coverageEstimate: 90,
        summary: 'Well covered.',
      },
      refactorings: {
        file: 'src/app.ts',
        suggestions: [],
        summary: 'No major refactors needed.',
      },
    },
  ],
  summary: {
    totalFiles: 1,
    overallScore: 90,
    criticalIssues: 0,
    highPriorityTests: 0,
    refactoringOpportunities: 0,
  },
  recommendations: [],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 1000,
    agentVersions: { 'code-quality-analyzer': '1.0.0' },
  },
};

/**
 * Makes the mocked query() yield a successful result with the given
 * structured_output, mimicking the real Agent SDK's async generator.
 */
function mockSuccessfulQuery(output: unknown = validReport) {
  mockQuery.mockImplementation(async function* () {
    yield { type: 'system', subtype: 'init' };
    yield { type: 'result', subtype: 'success', structured_output: output };
  });
}

beforeEach(() => {
  mockQuery.mockReset();
});

describe('CodeReviewOrchestrator', () => {
  describe('Configuration', () => {
    it('should initialize with default options', () => {
      expect(() => new CodeReviewOrchestrator()).not.toThrow();
    });

    it('should accept custom rate limit configuration', () => {
      const orchestrator = new CodeReviewOrchestrator({
        rateLimits: { maxRequestsPerMinute: 5, maxConcurrent: 1, maxTokensPerMinute: 10000 },
      });

      const status = orchestrator.getRateLimiterStatus();
      // No requests made yet, so availableRequests should equal the configured limit
      expect(status.availableRequests).toBe(5);
    });
  });

  describe('reviewPullRequest', () => {
    it('should configure the GitHub and ESLint MCP servers', async () => {
      mockSuccessfulQuery();
      const orchestrator = new CodeReviewOrchestrator({ maxRetries: 1, timeoutMs: 5000 });

      await orchestrator.reviewPullRequest('airaamane', 'simple-todo-app', 1);

      expect(mockQuery).toHaveBeenCalledTimes(1);
      const callArgs = mockQuery.mock.calls[0][0];
      expect(callArgs.options.mcpServers).toHaveProperty('github');
      expect(callArgs.options.mcpServers).toHaveProperty('eslint');
    });

    it('should register and enable spawning of all 3 subagents via the Task tool', async () => {
      mockSuccessfulQuery();
      const orchestrator = new CodeReviewOrchestrator({ maxRetries: 1, timeoutMs: 5000 });

      await orchestrator.reviewPullRequest('airaamane', 'simple-todo-app', 1);

      const callArgs = mockQuery.mock.calls[0][0];
      expect(Object.keys(callArgs.options.agents)).toEqual(
        expect.arrayContaining([
          'code-quality-analyzer',
          'test-coverage-analyzer',
          'refactoring-suggester',
        ])
      );
      expect(callArgs.options.allowedTools).toContain('Task');
    });

    it('should aggregate the structured output into a ReviewReport', async () => {
      mockSuccessfulQuery();
      const orchestrator = new CodeReviewOrchestrator({ maxRetries: 1, timeoutMs: 5000 });

      const report = await orchestrator.reviewPullRequest('airaamane', 'simple-todo-app', 1);

      expect(report.pullRequest).toEqual({
        owner: 'airaamane',
        repo: 'simple-todo-app',
        number: 1,
      });
      expect(report.fileReviews).toHaveLength(1);
      expect(report.summary.overallScore).toBe(90);
    });

    it('should throw when the structured output fails Zod validation', async () => {
      mockSuccessfulQuery({ not: 'a valid report' });
      const orchestrator = new CodeReviewOrchestrator({ maxRetries: 1, timeoutMs: 5000 });

      await expect(
        orchestrator.reviewPullRequest('airaamane', 'simple-todo-app', 1)
      ).rejects.toThrow();
    });

    it('should throw when the query completes without structured output', async () => {
      mockQuery.mockImplementation(async function* () {
        yield { type: 'result', subtype: 'success' };
      });
      const orchestrator = new CodeReviewOrchestrator({ maxRetries: 1, timeoutMs: 5000 });

      await expect(
        orchestrator.reviewPullRequest('airaamane', 'simple-todo-app', 1)
      ).rejects.toThrow();
    });
  });

  describe('Integration', () => {
    // Requires real API keys / network access — run manually, not in CI.
    it.skip('should review a real small PR', async () => {
      // const orchestrator = new CodeReviewOrchestrator();
      // const report = await orchestrator.reviewPullRequest('octocat', 'Hello-World', 1);
      // expect(report.pullRequest.number).toBe(1);
    });
  });
});
