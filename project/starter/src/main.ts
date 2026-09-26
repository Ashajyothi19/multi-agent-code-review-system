import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';

import { CodeReviewOrchestrator } from './orchestrator';
import { ReportGenerator } from './utils/report-generator';
import { formatError, isReviewError } from './utils/error-handler';

// Load environment variables
dotenv.config();

/**
 * Main entry point for the Claude Multi-Agent Code Review System
 * Usage: npm run dev -- <owner> <repo> <pr-number>
 */
async function main() {
  const [owner, repo, prStr] = process.argv.slice(2);

  // --- Validate command line arguments ---
  if (!owner || !repo || !prStr) {
    console.error('❌ Missing required arguments.');
    console.error('Usage: npm run dev -- <owner> <repo> <pr-number>');
    console.error('Example: npm run dev -- octocat Hello-World 1');
    process.exit(1);
  }

  // Use parseInt + a strict digits-only check so things like "3abc" are rejected
  const prNumber = parseInt(prStr, 10);
  if (!/^\d+$/.test(prStr) || !Number.isInteger(prNumber) || prNumber <= 0) {
    console.error(`❌ Invalid PR number: "${prStr}". Must be a positive integer.`);
    process.exit(1);
  }

  // --- Validate authentication (choose ONE method) ---
  const hasAnthropicKey = Boolean(process.env.ANTHROPIC_API_KEY);
  const hasBedrockCreds =
    Boolean(process.env.AWS_ACCESS_KEY_ID) && Boolean(process.env.AWS_SECRET_ACCESS_KEY);

  if (!hasAnthropicKey && !hasBedrockCreds) {
    console.error('❌ Missing authentication. Configure ONE of the following:');
    console.error('  - ANTHROPIC_API_KEY (Anthropic API)');
    console.error('  - AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (AWS Bedrock)');
    process.exit(1);
  }

  if (hasAnthropicKey) {
    console.log('🔐 Using Anthropic API authentication');
  } else {
    if (!process.env.AWS_REGION) {
      console.error('❌ AWS Bedrock credentials found, but AWS_REGION is not set.');
      process.exit(1);
    }
    console.log('🔐 Using AWS Bedrock authentication');
  }

  // --- Validate ANTHROPIC_MODEL (required for both auth methods) ---
  const model = process.env.ANTHROPIC_MODEL;
  if (!model) {
    console.error('❌ Missing ANTHROPIC_MODEL environment variable.');
    console.error('  - Anthropic API format:  claude-sonnet-4-5-20250929');
    console.error('  - AWS Bedrock format:    us.anthropic.claude-sonnet-4-5-20250929-v1:0');
    process.exit(1);
  }

  console.log(`🔍 Reviewing PR #${prNumber} in ${owner}/${repo}...`);

  try {
    // --- Run the review ---
    const orchestrator = new CodeReviewOrchestrator();
    const report = await orchestrator.reviewPullRequest(owner, repo, prNumber);

    // --- Generate reports in all three formats ---
    const generator = new ReportGenerator();
    const reportsDir = path.resolve(process.cwd(), 'reports');
    fs.mkdirSync(reportsDir, { recursive: true });

    const baseName = `${owner}_${repo}_${prNumber}`;
    const jsonPath = path.join(reportsDir, `${baseName}.json`);
    const mdPath = path.join(reportsDir, `${baseName}.md`);
    const htmlPath = path.join(reportsDir, `${baseName}.html`);

    fs.writeFileSync(jsonPath, generator.generateJSONReport(report), 'utf-8');
    fs.writeFileSync(mdPath, generator.generateMarkdownReport(report), 'utf-8');
    fs.writeFileSync(htmlPath, generator.generateHTMLReport(report), 'utf-8');

    console.log('✅ Review complete. Reports saved:');
    console.log(`   - ${jsonPath}`);
    console.log(`   - ${mdPath}`);
    console.log(`   - ${htmlPath}`);
  } catch (error) {
    if (isReviewError(error)) {
      console.error(`❌ Review failed: ${formatError(error)}`);
    } else {
      console.error('❌ Unexpected error:', error);
    }
    process.exit(1);
  }
}

main();
