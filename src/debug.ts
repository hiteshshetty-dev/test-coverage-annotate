import type { PrData, UncoveredFiles, LcovFile } from './types.js';
import type { ExcludedFileReason } from './coverage-files.js';
import { lcovPathMatchesPrPath } from './analyze.js';

const REASON_LABELS: Record<ExcludedFileReason['reason'], string> = {
  not_valid_for_coverage:
    'Not valid for coverage (e.g. test file, config, wrong extension)',
  did_not_match_include: 'Did not match coverage-files-include pattern',
  matched_exclude: 'Matched coverage-files-exclude pattern',
};

/**
 * Log a summary of which PR files were considered for coverage vs ignored, with reasons.
 */
export function logFileFilterSummary(
  considered: PrData,
  excluded: ExcludedFileReason[],
  notInCoverageData: string[]
): void {
  console.log('\n========== Coverage debug: files ==========');
  console.log('Considered for coverage (included by filters and in PR diff):');
  if (considered.length === 0) {
    console.log('  (none)');
  } else {
    considered.forEach((f) => {
      const inCov = notInCoverageData.includes(f.fileName) ? ' [NOT IN LCOV]' : '';
      console.log(`  - ${f.fileName}${inCov}`);
    });
  }
  console.log('\nIgnored (excluded by filters):');
  if (excluded.length === 0) {
    console.log('  (none)');
  } else {
    excluded.forEach(({ fileName, reason }) => {
      console.log(`  - ${fileName}`);
      console.log(`    Reason: ${REASON_LABELS[reason]}`);
    });
  }
  if (notInCoverageData.length > 0) {
    console.log('\nConsidered but not found in coverage report (LCOV):');
    notInCoverageData.forEach((f) => console.log(`  - ${f}`));
  }
  console.log('============================================\n');
}

export interface UncoveredNewLine {
  fileName: string;
  lineNumber: number;
}

/**
 * Reason why a new line is not in coveredNewLines, for clearer debug output.
 */
function getUncoveredLineReason(
  fileName: string,
  lineNum: number,
  untestedLinesOfFiles: UncoveredFiles,
  coverageJSON: LcovFile[]
): string {
  const annotationTypes = untestedLinesOfFiles[fileName]
    ?.filter((u) => u.lineNumber === lineNum)
    .map((u) => u.annotationType);
  if (annotationTypes?.length) {
    return `(${annotationTypes.join(', ')})`;
  }
  const fileCoverage = coverageJSON.find((c) => lcovPathMatchesPrPath(c.file, fileName));
  if (!fileCoverage) {
    return '(file not in LCOV)';
  }
  const hasLineEntry = fileCoverage.lines.details.some((d) => d.line === lineNum);
  if (!hasLineEntry) {
    return '(line has no DA entry in LCOV — not instrumented or coverage from different revision)';
  }
  return '(no LCOV entry or file missing)';
}

/**
 * Log every new line that is not included in coveredNewLines, and how each contributes to the percentage.
 * Uses the same logic as getNewLinesCoverageStats: a line is "uncovered" if the file is missing from
 * LCOV, or the line has no LCOV entry, or the line has hit count 0.
 * Also logs the subset that have annotations (lines/functions/branches) for context.
 */
export function logUncoveredLinesAndPercentage(
  uncoveredNewLinesList: UncoveredNewLine[],
  untestedLinesOfFiles: UncoveredFiles,
  totalNewLines: number,
  coveredNewLines: number,
  threshold: number,
  coverageJSON: LcovFile[] = []
): void {
  const uncoveredCount = totalNewLines - coveredNewLines;
  const pct = totalNewLines > 0 ? (coveredNewLines / totalNewLines) * 100 : 100;
  const contributionPerLine =
    totalNewLines > 0 ? 100 / totalNewLines : 0;

  console.log('\n========== Coverage debug: uncovered lines & percentage ==========');
  console.log(`Total new/changed lines (considered): ${totalNewLines}`);
  console.log(`Covered: ${coveredNewLines} | Uncovered (not in coveredNewLines): ${uncoveredCount}`);
  console.log(`New lines coverage: ${pct.toFixed(2)}% (threshold: ${threshold}%)`);
  console.log(
    `Each uncovered line contributes: ${contributionPerLine.toFixed(2)}% (1/${totalNewLines} of 100%)`
  );
  console.log('');

  console.log('All new lines NOT included in coveredNewLines (reduce percentage):');
  if (uncoveredNewLinesList.length === 0) {
    console.log('  (none)');
  } else {
    const byFile = new Map<string, number[]>();
    for (const { fileName, lineNumber } of uncoveredNewLinesList) {
      const lines = byFile.get(fileName) ?? [];
      lines.push(lineNumber);
      byFile.set(fileName, lines);
    }
    for (const fileName of [...byFile.keys()].sort()) {
      const lines = byFile.get(fileName)!;
      lines.sort((a, b) => a - b);
      const contrib = (1 / totalNewLines) * 100;
      console.log(`  ${fileName}:`);
      for (const lineNum of lines) {
        const reason = getUncoveredLineReason(
          fileName,
          lineNum,
          untestedLinesOfFiles,
          coverageJSON
        );
        console.log(`    Line ${lineNum} → −${contributionPerLine.toFixed(2)}% ${reason}`);
      }
    }
  }
  console.log('==================================================================\n');
}
