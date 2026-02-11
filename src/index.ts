import * as core from '@actions/core';
import { Octokit } from '@octokit/rest';
import fetch from 'node-fetch';
import { Toolkit } from 'actions-toolkit';
import { getDiffWithLineNumbers } from './git_diff.js';
import { filterPrDataForCoverageWithReasons } from './coverage-files.js';
import { coverageReportToJs } from './lcov-to-json.js';
import {
  findUncoveredCodeInPR,
  getUncoveredNewLineNumbersFromUntested,
  lcovPathMatchesPrPath,
} from './analyze.js';
import { createAnnotations } from './annotations.js';
import { createOrUpdateCheck } from './check-run.js';
import type { PullRequestRef } from './check-run.js';
import { createOrUpdateCoverageComment } from './pr-comment.js';
import { logFileFilterSummary, logUncoveredLinesAndPercentage } from './debug.js';

Toolkit.run(async (tools) => {
  try {
    const githubToken = core.getInput('token');
    const octokit = new Octokit({
      previews: ['antiope'],
      auth: githubToken,
      request: { fetch: fetch as unknown as typeof globalThis.fetch },
    });

    const toolkit = new Toolkit({ token: githubToken });

    const createData = {
      started_at: new Date().toISOString(),
      status: 'in_progress',
      name: 'Test Coverage Annotate',
    };

    const eventType = core.getInput('action-type');
    console.log('eventType:', eventType);
    let PR: PullRequestRef;
    if (eventType === 'workflow_dispatch') {
      const payload = toolkit.context.payload as { inputs?: { pr_number?: number } };
      const prNumber = payload.inputs?.pr_number;
      if (prNumber == null) throw new Error('workflow_dispatch requires inputs.pr_number');
      const res = await octokit.pulls.get({
        owner: toolkit.context.repo.owner,
        repo: toolkit.context.repo.repo,
        pull_number: prNumber,
      });
      PR = res.data as PullRequestRef;
    } else {
      PR = toolkit.context.payload.pull_request as unknown as PullRequestRef;
    }

    const response = await createOrUpdateCheck(createData, 'create', toolkit, PR);
    const check_id = response.data.id;
    console.log('Check Successfully Created', check_id);

    const prData = await getDiffWithLineNumbers('HEAD^1');
    const coverageFilesInclude = core.getInput('coverage-files-include');
    const coverageFilesExclude = core.getInput('coverage-files-exclude');
    const filterResult = filterPrDataForCoverageWithReasons(prData, {
      include: coverageFilesInclude || undefined,
      exclude: coverageFilesExclude || undefined,
    });
    const prDataForCoverage = filterResult.included;

    const coverageReportPath = core.getInput('coverage-info-path');
    const noOfCoverageFiles = core.getInput('total-coverage-files');

    const coverageJSON = await coverageReportToJs(coverageReportPath, noOfCoverageFiles);

    const typesToCoverInput = core.getInput('annotation-type');
    const typesToCover = typesToCoverInput.split(',').map((item) => item.trim());

    const { untestedLinesOfFiles, totalNewLines, coveredNewLines } =
      await findUncoveredCodeInPR(prDataForCoverage, coverageJSON, typesToCover);
    const coverageType = core.getInput('annotation-coverage');
    const annotations = createAnnotations(untestedLinesOfFiles, coverageType);
    const totalFiles = Object.keys(untestedLinesOfFiles).length;
    const totalWarnings = annotations.length;

    const thresholdInput = core.getInput('new-lines-coverage-threshold');
    const threshold = Math.min(100, Math.max(0, parseInt(thresholdInput, 10) || 90));
    const newLinesCoveragePct =
      totalNewLines > 0 ? Math.round((coveredNewLines / totalNewLines) * 100) : 100;
    const meetsThreshold = totalNewLines === 0 || newLinesCoveragePct >= threshold;

    const debug = /^(true|1|yes)$/i.test(core.getInput('debug') || '');
    if (debug) {
      const notInCoverageData = prDataForCoverage
        .filter(
          (f) => !coverageJSON.some((c) => lcovPathMatchesPrPath(c.file, f.fileName))
        )
        .map((f) => f.fileName);
      logFileFilterSummary(
        prDataForCoverage,
        filterResult.excluded,
        notInCoverageData
      );
      const uncoveredNewLinesList = getUncoveredNewLineNumbersFromUntested(
        untestedLinesOfFiles
      );
      logUncoveredLinesAndPercentage(
        uncoveredNewLinesList,
        untestedLinesOfFiles,
        totalNewLines,
        coveredNewLines,
        threshold,
        coverageJSON
      );
    }

    const updateData: {
      check_run_id: number;
      output: { title: string; summary?: string; annotations?: typeof annotations };
    } = {
      check_run_id: check_id,
      output: {
        title: 'Test Coverage Annotate🔎',
      },
    };
    const noFilesMatchedFilter =
      prData.length > 0 && prDataForCoverage.length === 0;
    const coverageSummary = `**New lines coverage:** ${coveredNewLines}/${totalNewLines} (${newLinesCoveragePct}%) — threshold ${threshold}%\n\n`;
    if (annotations.length === 0) {
      updateData.output.summary =
        coverageSummary +
        (noFilesMatchedFilter
          ? 'No files in this PR matched the coverage include/exclude filters. No coverage check performed.'
          : 'All Good! We found No Uncovered Lines of Code in your Pull Request.🚀');
    } else {
      let summary = coverageSummary;
      summary += `### Found a Total of ${totalWarnings} Instances of Uncovered Code in ${totalFiles} Files!⚠️\n\n`;
      summary += 'File Name | No. of Warnings\n';
      summary += '--------- | ---------------\n';
      Object.entries(untestedLinesOfFiles).forEach(([filename, untestedStuffArray]) => {
        summary += `${filename} | ${untestedStuffArray.length}\n`;
      });
      updateData.output.summary = summary;
    }

    const leftAnnotations = [...annotations];
    while (leftAnnotations.length > 0) {
      const toProcess = leftAnnotations.splice(0, 50);
      updateData.output.annotations = toProcess;
      await createOrUpdateCheck(updateData, 'update', toolkit, PR);
      console.log('Check Successfully Updated.');
    }

    const completeData = {
      ...updateData,
      conclusion: meetsThreshold ? 'success' : ('failure' as const),
      status: 'completed',
      completed_at: new Date().toISOString(),
    };
    if (!meetsThreshold) {
      (completeData.output as { summary?: string }).summary =
        (completeData.output.summary ?? '') +
        `\n\n❌ **Check failed:** New lines coverage ${newLinesCoveragePct}% is below the required ${threshold}%.`;
    }
    delete (completeData.output as { annotations?: unknown }).annotations;
    await createOrUpdateCheck(completeData, 'update', toolkit, PR);
    console.log('Check Successfully Closed');

    const commentOnPr = core.getInput('comment-on-pr');
    if (commentOnPr !== 'false' && commentOnPr !== '0') {
      try {
        await createOrUpdateCoverageComment(
          octokit,
          toolkit.context.repo.owner,
          toolkit.context.repo.repo,
          PR.number,
          {
            meetsThreshold,
            newLinesCoveragePct,
            coveredNewLines,
            totalNewLines,
            threshold,
            totalWarnings,
            totalFilesWithWarnings: totalFiles,
            untestedLinesOfFiles,
            noFilesMatchedFilter,
          }
        );
      } catch (commentError: unknown) {
        const err = commentError as Error & { status?: number; response?: { status?: number } };
        const msg = err.message ?? String(commentError);
        const is403 =
          err.status === 403 ||
          err.response?.status === 403 ||
          /403|Forbidden/i.test(msg);
        console.warn('Could not post coverage comment on PR:', msg);
        if (is403) {
          console.warn(
            'Tip: 403 usually means the token cannot write to this PR (e.g. PR from a fork). ' +
              'Use a PAT with repo scope, grant workflow "Contents: write" / "Pull requests: write", or set comment-on-pr: false.'
          );
        }
      }
    }

    if (!meetsThreshold) {
      tools.exit.failure(
        `New lines coverage ${newLinesCoveragePct}% is below the required ${threshold}%.`
      );
    }
  } catch (error) {
    tools.exit.failure((error as Error).message);
  }

  tools.exit.success('PR Scan and Warn Analysis completed successfully!');
});
