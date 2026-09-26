import { query } from '@anthropic-ai/claude-agent-sdk';

import { mcpServersConfig } from './config/mcp.config';
import { codeQualityAnalyzer, testCoverageAnalyzer, refactoringSuggester } from './agents';
import { buildOrchestratorPrompt } from './prompts';
import { ReviewReportSchema, ReviewReportJSONSchema } from './types/report-types';
import type { ReviewReport } from './types/report-types';
import { RateLimiter, withRateLimit } from './utils/rate-limiter';
import type { RateLimiterConfig } from './utils/rate-limiter';
import { withRetry, withTimeout, ReviewError, ErrorCodes } from './utils/error-handler';
import { logger, logReviewStart, logReviewComplete, logReviewError } from './utils/logger';

/**
 * Orchestrator configuration options
 */
export interface OrchestratorOptions {
  /** Override default rate limits (requests/tokens per minute, concurrency) */
  rateLimits?: Partial<RateLimiterConfig>;
  /** Max time (ms) allowed for a single review attempt before giving up. Default: 5 minutes */
  timeoutMs?: number;
  /** Max retry attempts if the review call fails. Default: 3 */
  maxRetries?: number;
  /** Base delay (ms) between retries. Default: 1000 */
  retryDelayMs?: number;
}

const DEFAULT_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_RETRIES = 3;
const DEFAULT_RETRY_DELAY_MS = 1000;
// Rough token estimate for a full multi-agent PR review call, used by the rate limiter
const ESTIMATED_TOKENS_PER_REVIEW = 20000;

/**
 * Main Code Review Orchestrator
 * Coordinates subagents to analyze pull requests and generate comprehensive reports
 */
export class CodeReviewOrchestrator {
  private rateLimiter: RateLimiter;
  private timeoutMs: number;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(options: OrchestratorOptions = {}) {
    this.rateLimiter = new RateLimiter(options.rateLimits);
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxRetries = options.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  /**
   * Expose current rate limiter status (useful for testing/observability)
   */
  getRateLimiterStatus() {
    return this.rateLimiter.getStatus();
  }

  /**
   * Review a pull request using parallel subagent analysis
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param prNumber - Pull request number
   * @returns Complete review report
   */
  async reviewPullRequest(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<ReviewReport> {
    const startedAt = Date.now();
    logReviewStart(owner, repo, prNumber);

    try {
      // Retry the whole (rate-limited, timed-out) query on transient failures
      const rawOutput = await withRetry(
        () =>
          withTimeout(
            () => this.runReviewQuery(owner, repo, prNumber),
            this.timeoutMs,
            `PR review timed out after ${this.timeoutMs}ms`
          ),
        this.maxRetries,
        this.retryDelayMs
      );

      const parsed = ReviewReportSchema.safeParse(rawOutput);
      if (!parsed.success) {
        throw new ReviewError(
          `Agent output did not match ReviewReport schema: ${parsed.error.message}`,
          ErrorCodes.STRUCTURED_OUTPUT_FAILED,
          { issues: parsed.error.issues }
        );
      }

      const durationMs = Date.now() - startedAt;
      const report: ReviewReport = {
        ...parsed.data,
        metadata: {
          ...parsed.data.metadata,
          duration: parsed.data.metadata.duration || durationMs,
        },
      };

      logReviewComplete(owner, repo, prNumber, report.summary.overallScore, durationMs);
      return report;
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logReviewError(owner, repo, prNumber, err);
      throw error;
    }
  }

  /**
   * Runs the Agent SDK query, respecting the configured rate limits.
   */
  private async runReviewQuery(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<unknown> {
    return withRateLimit(
      this.rateLimiter,
      () => this.executeQuery(owner, repo, prNumber),
      ESTIMATED_TOKENS_PER_REVIEW
    );
  }

  /**
   * Builds and runs the actual Claude Agent SDK query: fetches PR data via
   * the GitHub MCP server, spawns the 3 subagents via the Task tool, and
   * collects the final structured ReviewReport output.
   */
  private async executeQuery(
    owner: string,
    repo: string,
    prNumber: number
  ): Promise<unknown> {
    const prompt = buildOrchestratorPrompt(owner, repo, prNumber);

    let structuredOutput: unknown;

    for await (const message of query({
      prompt,
      options: {
        mcpServers: mcpServersConfig,
        // Task tool is required to spawn subagents; GitHub/ESLint MCP tools
        // are needed to fetch PR data and lint files respectively.
        allowedTools: ['Task', 'mcp__github', 'mcp__eslint', 'Read', 'Grep', 'Glob'],
        agents: {
          'code-quality-analyzer': codeQualityAnalyzer,
          'test-coverage-analyzer': testCoverageAnalyzer,
          'refactoring-suggester': refactoringSuggester,
        },
        outputFormat: {
          type: 'json_schema',
          schema: ReviewReportJSONSchema,
        },
      },
    })) {
      // Message shapes vary by SDK version; treat defensively.
      const msg = message as {
        type?: string;
        subtype?: string;
        structured_output?: unknown;
      };

      if (msg.type === 'result') {
        if (msg.subtype === 'success') {
          if (msg.structured_output) {
            structuredOutput = msg.structured_output;
          }
        } else {
          throw new ReviewError(
            `Agent SDK query ended with non-success result: ${msg.subtype}`,
            ErrorCodes.AGENT_FAILED,
            { subtype: msg.subtype }
          );
        }
      }
    }

    if (!structuredOutput) {
      throw new ReviewError(
        'Agent SDK query completed without returning structured output',
        ErrorCodes.STRUCTURED_OUTPUT_FAILED
      );
    }

    logger.debug('Received structured output from orchestrator query', { owner, repo, prNumber });
    return structuredOutput;
  }
}
