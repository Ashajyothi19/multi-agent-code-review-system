import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { TEST_COVERAGE_ANALYZER_PROMPT } from '../prompts/test-coverage-analyzer.prompt';

/**
 * Test Coverage Analyzer subagent
 *
 * Identifies functions/methods without test coverage, suggests specific
 * test cases with meaningful assertions, and estimates overall coverage.
 */
export const testCoverageAnalyzer: AgentDefinition = {
  description:
    'Identifies untested functions, classes, branches, and edge cases in a changed file, and suggests specific test cases. Use for every changed file in a pull request that needs a test coverage review.',
  prompt: TEST_COVERAGE_ANALYZER_PROMPT,
  // Needs to search for existing test files alongside the source file
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  model: 'inherit',
};
