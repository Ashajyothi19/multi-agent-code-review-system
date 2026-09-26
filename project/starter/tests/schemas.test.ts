import { describe, it, expect } from 'vitest';
import { ZodError } from 'zod';
import {
  CodeQualityResultSchema,
  TestCoverageResultSchema,
  RefactoringSuggestionSchema,
  CodeQualityResultJSONSchema,
  TestCoverageResultJSONSchema,
  RefactoringSuggestionJSONSchema,
} from '../src/types/analysis-results';
import {
  ReviewReportSchema,
  ReviewReportJSONSchema,
} from '../src/types/report-types';

// ---------------------------------------------------------------------------
// Fixtures — minimal valid objects for each schema
// ---------------------------------------------------------------------------

const validCodeQualityResult = {
  file: 'src/utils/helpers.ts',
  issues: [
    {
      line: 42,
      severity: 'high' as const,
      category: 'security' as const,
      description: 'Unsanitized user input passed to eval()',
      suggestion: 'Remove eval() usage and parse input safely',
    },
  ],
  overallScore: 72,
  summary: 'A few security and maintainability issues found.',
};

const validTestCoverageResult = {
  file: 'src/utils/helpers.ts',
  hasTests: true,
  testFiles: ['tests/helpers.test.ts'],
  untestedPaths: [
    {
      type: 'function' as const,
      location: 'formatDate()',
      priority: 'high' as const,
      reasoning: 'Handles user-facing date formatting with no null check',
      suggestedTest: 'Assert formatDate(null) does not throw and returns a fallback string',
    },
  ],
  coverageEstimate: 65,
  summary: 'Core paths covered; edge cases missing.',
};

const validRefactoringSuggestion = {
  file: 'src/utils/helpers.ts',
  suggestions: [
    {
      type: 'extract-function' as const,
      location: 'processData() lines 10-45',
      impact: 'medium' as const,
      description: 'Extract validation logic into its own function',
      before: 'function processData(x) { if (!x) {...} ... }',
      after: 'function processData(x) { validateInput(x); ... }',
      benefits: 'Improves readability and enables independent testing of validation',
    },
  ],
  summary: 'One extract-function opportunity identified.',
};

const validReviewReport = {
  pullRequest: { owner: 'airaamane', repo: 'simple-todo-app', number: 1 },
  fileReviews: [
    {
      file: 'src/utils/helpers.ts',
      codeQuality: validCodeQualityResult,
      testCoverage: validTestCoverageResult,
      refactorings: validRefactoringSuggestion,
    },
  ],
  summary: {
    totalFiles: 1,
    overallScore: 72,
    criticalIssues: 0,
    highPriorityTests: 1,
    refactoringOpportunities: 1,
  },
  recommendations: [
    {
      priority: 'high' as const,
      category: 'security',
      description: 'Remove eval() usage in helpers.ts',
      files: ['src/utils/helpers.ts'],
    },
  ],
  metadata: {
    analyzedAt: new Date().toISOString(),
    duration: 12345,
    agentVersions: { 'code-quality-analyzer': '1.0.0' },
  },
};

// ---------------------------------------------------------------------------
// CodeQualityResultSchema
// ---------------------------------------------------------------------------

describe('CodeQualityResultSchema', () => {
  it('accepts valid data', () => {
    expect(() => CodeQualityResultSchema.parse(validCodeQualityResult)).not.toThrow();
  });

  it('accepts an empty issues array', () => {
    const data = { ...validCodeQualityResult, issues: [] };
    expect(() => CodeQualityResultSchema.parse(data)).not.toThrow();
  });

  it('accepts boundary overallScore values (0 and 100)', () => {
    expect(() =>
      CodeQualityResultSchema.parse({ ...validCodeQualityResult, overallScore: 0 })
    ).not.toThrow();
    expect(() =>
      CodeQualityResultSchema.parse({ ...validCodeQualityResult, overallScore: 100 })
    ).not.toThrow();
  });

  it('rejects overallScore out of range', () => {
    expect(() =>
      CodeQualityResultSchema.parse({ ...validCodeQualityResult, overallScore: 101 })
    ).toThrow(ZodError);
    expect(() =>
      CodeQualityResultSchema.parse({ ...validCodeQualityResult, overallScore: -1 })
    ).toThrow(ZodError);
  });

  it('rejects missing required fields', () => {
    const { file, ...withoutFile } = validCodeQualityResult;
    expect(() => CodeQualityResultSchema.parse(withoutFile)).toThrow(ZodError);
  });

  it('rejects an invalid severity enum value', () => {
    const data = {
      ...validCodeQualityResult,
      issues: [{ ...validCodeQualityResult.issues[0], severity: 'catastrophic' }],
    };
    expect(() => CodeQualityResultSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects an invalid category enum value', () => {
    const data = {
      ...validCodeQualityResult,
      issues: [{ ...validCodeQualityResult.issues[0], category: 'not-a-category' }],
    };
    expect(() => CodeQualityResultSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects wrong types (line as string instead of number)', () => {
    const data = {
      ...validCodeQualityResult,
      issues: [{ ...validCodeQualityResult.issues[0], line: 'forty-two' }],
    };
    expect(() => CodeQualityResultSchema.parse(data)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// TestCoverageResultSchema
// ---------------------------------------------------------------------------

describe('TestCoverageResultSchema', () => {
  it('accepts valid data', () => {
    expect(() => TestCoverageResultSchema.parse(validTestCoverageResult)).not.toThrow();
  });

  it('accepts empty testFiles and untestedPaths arrays', () => {
    const data = { ...validTestCoverageResult, testFiles: [], untestedPaths: [] };
    expect(() => TestCoverageResultSchema.parse(data)).not.toThrow();
  });

  it('accepts boundary coverageEstimate values (0 and 100)', () => {
    expect(() =>
      TestCoverageResultSchema.parse({ ...validTestCoverageResult, coverageEstimate: 0 })
    ).not.toThrow();
    expect(() =>
      TestCoverageResultSchema.parse({ ...validTestCoverageResult, coverageEstimate: 100 })
    ).not.toThrow();
  });

  it('rejects coverageEstimate out of range', () => {
    expect(() =>
      TestCoverageResultSchema.parse({ ...validTestCoverageResult, coverageEstimate: 150 })
    ).toThrow(ZodError);
  });

  it('rejects hasTests as a non-boolean', () => {
    const data = { ...validTestCoverageResult, hasTests: 'yes' };
    expect(() => TestCoverageResultSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects an invalid untestedPaths type enum value', () => {
    const data = {
      ...validTestCoverageResult,
      untestedPaths: [{ ...validTestCoverageResult.untestedPaths[0], type: 'module' }],
    };
    expect(() => TestCoverageResultSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects missing required fields', () => {
    const { summary, ...withoutSummary } = validTestCoverageResult;
    expect(() => TestCoverageResultSchema.parse(withoutSummary)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// RefactoringSuggestionSchema
// ---------------------------------------------------------------------------

describe('RefactoringSuggestionSchema', () => {
  it('accepts valid data', () => {
    expect(() => RefactoringSuggestionSchema.parse(validRefactoringSuggestion)).not.toThrow();
  });

  it('accepts an empty suggestions array', () => {
    const data = { ...validRefactoringSuggestion, suggestions: [] };
    expect(() => RefactoringSuggestionSchema.parse(data)).not.toThrow();
  });

  it('rejects an invalid suggestion type enum value', () => {
    const data = {
      ...validRefactoringSuggestion,
      suggestions: [{ ...validRefactoringSuggestion.suggestions[0], type: 'rewrite-everything' }],
    };
    expect(() => RefactoringSuggestionSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects an invalid impact enum value', () => {
    const data = {
      ...validRefactoringSuggestion,
      suggestions: [{ ...validRefactoringSuggestion.suggestions[0], impact: 'huge' }],
    };
    expect(() => RefactoringSuggestionSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects missing required fields', () => {
    const { file, ...withoutFile } = validRefactoringSuggestion;
    expect(() => RefactoringSuggestionSchema.parse(withoutFile)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// ReviewReportSchema (aggregate)
// ---------------------------------------------------------------------------

describe('ReviewReportSchema', () => {
  it('accepts valid data', () => {
    expect(() => ReviewReportSchema.parse(validReviewReport)).not.toThrow();
  });

  it('accepts empty fileReviews and recommendations arrays', () => {
    const data = { ...validReviewReport, fileReviews: [], recommendations: [] };
    expect(() => ReviewReportSchema.parse(data)).not.toThrow();
  });

  it('rejects a missing nested pullRequest field', () => {
    const data = {
      ...validReviewReport,
      pullRequest: { owner: 'airaamane', repo: 'simple-todo-app' }, // missing "number"
    };
    expect(() => ReviewReportSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects an invalid recommendation priority enum value', () => {
    const data = {
      ...validReviewReport,
      recommendations: [{ ...validReviewReport.recommendations[0], priority: 'urgent' }],
    };
    expect(() => ReviewReportSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects a malformed nested fileReviews entry (invalid codeQuality)', () => {
    const data = {
      ...validReviewReport,
      fileReviews: [
        {
          ...validReviewReport.fileReviews[0],
          codeQuality: { ...validCodeQualityResult, overallScore: 200 },
        },
      ],
    };
    expect(() => ReviewReportSchema.parse(data)).toThrow(ZodError);
  });

  it('rejects missing metadata', () => {
    const { metadata, ...withoutMetadata } = validReviewReport;
    expect(() => ReviewReportSchema.parse(withoutMetadata)).toThrow(ZodError);
  });
});

// ---------------------------------------------------------------------------
// JSON Schema export validation (for SDK structured outputs)
// ---------------------------------------------------------------------------

describe('JSON Schema exports', () => {
  it('CodeQualityResultJSONSchema is a valid, non-empty JSON schema object', () => {
    expect(CodeQualityResultJSONSchema).toBeTypeOf('object');
    expect(CodeQualityResultJSONSchema).toHaveProperty('properties');
    const properties = (CodeQualityResultJSONSchema as { properties: Record<string, unknown> })
      .properties;
    expect(properties).toHaveProperty('file');
    expect(properties).toHaveProperty('issues');
    expect(properties).toHaveProperty('overallScore');
    expect(properties).toHaveProperty('summary');
  });

  it('CodeQualityResultJSONSchema marks all top-level fields as required', () => {
    const required = (CodeQualityResultJSONSchema as { required?: string[] }).required ?? [];
    expect(required).toEqual(
      expect.arrayContaining(['file', 'issues', 'overallScore', 'summary'])
    );
  });

  it('TestCoverageResultJSONSchema is a valid, non-empty JSON schema object', () => {
    expect(TestCoverageResultJSONSchema).toBeTypeOf('object');
    expect(TestCoverageResultJSONSchema).toHaveProperty('properties');
    const properties = (TestCoverageResultJSONSchema as { properties: Record<string, unknown> })
      .properties;
    expect(properties).toHaveProperty('hasTests');
    expect(properties).toHaveProperty('untestedPaths');
    expect(properties).toHaveProperty('coverageEstimate');
  });

  it('RefactoringSuggestionJSONSchema is a valid, non-empty JSON schema object', () => {
    expect(RefactoringSuggestionJSONSchema).toBeTypeOf('object');
    expect(RefactoringSuggestionJSONSchema).toHaveProperty('properties');
    const properties = (
      RefactoringSuggestionJSONSchema as { properties: Record<string, unknown> }
    ).properties;
    expect(properties).toHaveProperty('suggestions');
    expect(properties).toHaveProperty('summary');
  });

  it('ReviewReportJSONSchema is a valid, non-empty JSON schema object with required top-level fields', () => {
    expect(ReviewReportJSONSchema).toBeTypeOf('object');
    expect(ReviewReportJSONSchema).toHaveProperty('properties');
    const properties = (ReviewReportJSONSchema as { properties: Record<string, unknown> })
      .properties;
    expect(properties).toHaveProperty('pullRequest');
    expect(properties).toHaveProperty('fileReviews');
    expect(properties).toHaveProperty('summary');
    expect(properties).toHaveProperty('recommendations');
    expect(properties).toHaveProperty('metadata');

    const required = (ReviewReportJSONSchema as { required?: string[] }).required ?? [];
    expect(required).toEqual(
      expect.arrayContaining([
        'pullRequest',
        'fileReviews',
        'summary',
        'recommendations',
        'metadata',
      ])
    );
  });
});
