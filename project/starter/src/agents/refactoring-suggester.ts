import type { AgentDefinition } from '@anthropic-ai/claude-agent-sdk';
import { REFACTORING_SUGGESTER_PROMPT } from '../prompts/refactoring-suggester.prompt';

/**
 * Refactoring Suggester subagent
 *
 * Identifies opportunities to apply design patterns and modern language
 * features, extract-method/class candidates, and dead or redundant code.
 */
export const refactoringSuggester: AgentDefinition = {
  description:
    'Identifies refactoring opportunities — design patterns, modernization, extract-function candidates, and dead code — in a changed file. Use for every changed file in a pull request that needs a refactoring review.',
  prompt: REFACTORING_SUGGESTER_PROMPT,
  tools: ['Read', 'Grep', 'Glob', 'Skill'],
  model: 'inherit',
};
