import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { CODE_QUALITY_ANALYZER_PROMPT } from '../prompts/code-quality-analyzer.prompt';

/**
 * Code Quality Analyzer subagent
 *
 * Analyzes code for security vulnerabilities, performance issues, and
 * maintainability concerns. Integrates Claude Skills (e.g.
 * javascript-best-practices, security-analysis) via the Skill tool, and
 * uses the ESLint MCP server for additional lint-based findings.
 */
export const codeQualityAnalyzer: AgentDefinition = {
  description:
    'Analyzes source files for security vulnerabilities, performance issues, and maintainability concerns. Use for every changed file in a pull request that needs a code quality review.',
  prompt: CODE_QUALITY_ANALYZER_PROMPT,
  // Read-only analysis + lint + skills — no Write/Edit/Bash needed
  tools: ['Read', 'Grep', 'Glob', 'Skill', 'mcp__eslint'],
  model: 'inherit',
};
