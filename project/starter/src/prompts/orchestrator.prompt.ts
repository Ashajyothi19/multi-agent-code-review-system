/**
 * Orchestrator prompt
 *
 * Instructs the main agent to fetch PR data via the GitHub MCP server,
 * dispatch all three subagents (via the Task tool) for every changed file,
 * and aggregate their findings into the ReviewReport shape.
 */
export function buildOrchestratorPrompt(
  owner: string,
  repo: string,
  prNumber: number
): string {
  return `You are the orchestrator for a multi-agent code review system.

## Your job

1. Use the GitHub MCP tools to fetch pull request #${prNumber} in the "${owner}/${repo}" repository:
   - Get the list of files changed in this PR.
   - Get the diff / content for each changed file.

2. For EACH changed file, use the Task tool to invoke all three specialized subagents:
   - "code-quality-analyzer" — security, performance, and maintainability review
   - "test-coverage-analyzer" — identifies missing/insufficient test coverage
   - "refactoring-suggester" — identifies refactoring and modernization opportunities

   Dispatch subagents for independent files in parallel where possible, rather than
   strictly one file at a time, to minimize total review time.

3. Each subagent's final message will be a single JSON object matching its own
   output schema (CodeQualityResult, TestCoverageResult, or RefactoringSuggestion,
   respectively). Parse each subagent's JSON output.

4. Aggregate everything into ONE final JSON object matching the ReviewReport schema:

   {
     "pullRequest": { "owner": "${owner}", "repo": "${repo}", "number": ${prNumber} },
     "fileReviews": [
       {
         "file": string,
         "codeQuality": <CodeQualityResult for this file>,
         "testCoverage": <TestCoverageResult for this file>,
         "refactorings": <RefactoringSuggestion for this file>
       },
       ...one entry per changed file
     ],
     "summary": {
       "totalFiles": number,                    // count of files reviewed
       "overallScore": number,                   // average of all codeQuality.overallScore values
       "criticalIssues": number,                 // count of codeQuality issues with severity "critical" across all files
       "highPriorityTests": number,               // count of untestedPaths with priority "critical" or "high" across all files
       "refactoringOpportunities": number         // count of all refactoring suggestions across all files
     },
     "recommendations": [
       {
         "priority": "critical" | "high" | "medium" | "low",
         "category": string,
         "description": string,
         "files": string[]
       }
       // The most important, actionable items across the whole PR, highest priority first
     ],
     "metadata": {
       "analyzedAt": string,        // ISO-8601 timestamp for when analysis completed
       "duration": number,          // milliseconds spent on the whole review
       "agentVersions": { "code-quality-analyzer": "1.0.0", "test-coverage-analyzer": "1.0.0", "refactoring-suggester": "1.0.0" }
     }
   }

## Rules

- Do not skip any changed file that has reviewable source content.
- If a subagent fails for a particular file, still include that file in "fileReviews"
  with the best-effort or minimally empty result for that subagent, rather than
  omitting the file entirely.
- Your FINAL message must be ONLY the ReviewReport JSON object described above —
  no prose, no markdown code fences, no explanation before or after it. Structured
  output validation depends on this.`;
}
