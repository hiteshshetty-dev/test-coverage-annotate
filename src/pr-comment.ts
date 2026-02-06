import type { Octokit } from '@octokit/rest';
import type { UncoveredFiles } from './types.js';

const COMMENT_MARKER = '<!-- test-coverage-annotate -->';

export interface CoverageCommentParams {
  meetsThreshold: boolean;
  newLinesCoveragePct: number;
  coveredNewLines: number;
  totalNewLines: number;
  threshold: number;
  totalWarnings: number;
  totalFilesWithWarnings: number;
  untestedLinesOfFiles: UncoveredFiles;
}

function buildCommentBody(params: CoverageCommentParams): string {
  const {
    meetsThreshold,
    newLinesCoveragePct,
    coveredNewLines,
    totalNewLines,
    threshold,
    totalWarnings,
    totalFilesWithWarnings,
    untestedLinesOfFiles,
  } = params;

  const fileRows = Object.entries(untestedLinesOfFiles)
    .map(([filename, items]) => `| ${filename} | ${items.length} |`)
    .join('\n');

  if (meetsThreshold) {
    return `${COMMENT_MARKER}

<details open>
<summary><strong>✅ Unit coverage — passed</strong></summary>

| Metric | Value |
| --- | --- |
| **Status** | ✅ **Passed** |
| **New lines coverage** | **${coveredNewLines}** / **${totalNewLines}** lines (**${newLinesCoveragePct}%**) |
| **Threshold** | ${threshold}% |
| **Uncovered instances** | ${totalWarnings} in ${totalFilesWithWarnings} file(s) |

${totalWarnings > 0 ? `### Uncovered code by file\n\n| File | Warnings |\n| --- | --- |\n${fileRows}\n` : 'All new/changed lines meet the coverage threshold.'}

</details>
`;
  }

  return `${COMMENT_MARKER}

<details open>
<summary><strong>❌ Unit coverage — failed</strong></summary>

| Metric | Value |
| --- | --- |
| **Status** | ❌ **Failed** |
| **New lines coverage** | **${coveredNewLines}** / **${totalNewLines}** lines (**${newLinesCoveragePct}%**) |
| **Required threshold** | ${threshold}% |
| **Uncovered instances** | ${totalWarnings} in ${totalFilesWithWarnings} file(s) |

New lines coverage is below the required ${threshold}%. Please add or update tests for the changed code.

${totalWarnings > 0 ? `### Uncovered code by file\n\n| File | Warnings |\n| --- | --- |\n${fileRows}\n` : ''}

</details>
`;
}

export async function createOrUpdateCoverageComment(
  octokit: Octokit,
  owner: string,
  repo: string,
  prNumber: number,
  params: CoverageCommentParams
): Promise<void> {
  const body = buildCommentBody(params);

  const { data: comments } = await octokit.issues.listComments({
    owner,
    repo,
    issue_number: prNumber,
  });

  const existing = comments.find((c) => c.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body,
    });
    console.log('Coverage comment updated on PR.');
  } else {
    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body,
    });
    console.log('Coverage comment added to PR.');
  }
}
