import type { PrData, LcovFile, UncoveredFiles, UncoveredLine, LcovDetailEntry } from './types.js';

/** Result of new-lines coverage stats for threshold check. */
export interface NewLinesCoverageStats {
  totalNewLines: number;
  coveredNewLines: number;
}

/**
 * Returns true when the LCOV file path and the PR/diff file path refer to the same file.
 * Handles monorepos: LCOV often has paths relative to a package (e.g. "src/foo.ts")
 * while the PR diff has paths relative to repo root (e.g. "packages/pkg/src/foo.ts").
 */
export function lcovPathMatchesPrPath(lcovPath: string, prPath: string): boolean {
  const n = (p: string) => p.replace(/\\/g, '/').replace(/^\/+/, '');
  const a = n(prPath);
  const b = n(lcovPath);
  if (a === b) return true;
  // PR path ends with LCOV path: e.g. "ve/visual-editor/src/foo.ts" vs "src/foo.ts"
  if (a.endsWith('/' + b)) return true;
  // LCOV path ends with PR path: e.g. "packages/x/src/foo.ts" vs "src/foo.ts"
  if (b.endsWith('/' + a)) return true;
  // Legacy: LCOV path contains full PR path (e.g. when LCOV has absolute or longer path)
  if (b.includes(a)) return true;
  return false;
}

export function isLineCovered(lineNumber: number, fileCoverage: LcovFile): boolean {
  for (const entry of fileCoverage.lines.details) {
    if (entry.line === lineNumber) {
      return (entry.hit ?? 0) > 0;
    }
  }
  return false;
}

/** True if this line has a DA (line coverage) entry in LCOV. Matches annotation logic: only such lines count for global coverage. */
export function hasLineEntry(lineNumber: number, fileCoverage: LcovFile): boolean {
  return fileCoverage.lines.details.some((d) => d.line === lineNumber);
}

/**
 * Compute new-lines coverage using the same definition as annotations: only count lines
 * that have an LCOV DA entry. Lines with no DA entry are ignored (neither total nor covered).
 */
export function getNewLinesCoverageStats(
  prData: PrData,
  coverageJSON: LcovFile[]
): NewLinesCoverageStats {
  let totalNewLines = 0;
  let coveredNewLines = 0;
  for (const file of prData) {
    const fileCoverage = coverageJSON.find((c) => lcovPathMatchesPrPath(c.file, file.fileName));
    for (const change of file.data) {
      const startLine = parseInt(change.lineNumber, 10);
      const count = parseInt(change.endsAfter, 10) || 1;
      for (let i = 0; i < count; i++) {
        const lineNum = startLine + i;
        if (fileCoverage && hasLineEntry(lineNum, fileCoverage)) {
          totalNewLines += 1;
          if (isLineCovered(lineNum, fileCoverage)) {
            coveredNewLines += 1;
          }
        }
      }
    }
  }
  return { totalNewLines, coveredNewLines };
}

/** New lines that have an LCOV DA entry and are uncovered (hit 0). Same set as annotation "lines" type. */
export function getUncoveredNewLineNumbers(
  prData: PrData,
  coverageJSON: LcovFile[]
): { fileName: string; lineNumber: number }[] {
  const out: { fileName: string; lineNumber: number }[] = [];
  for (const file of prData) {
    const fileCoverage = coverageJSON.find((c) => lcovPathMatchesPrPath(c.file, file.fileName));
    for (const change of file.data) {
      const startLine = parseInt(change.lineNumber, 10);
      const count = parseInt(change.endsAfter, 10) || 1;
      for (let i = 0; i < count; i++) {
        const lineNum = startLine + i;
        if (
          fileCoverage &&
          hasLineEntry(lineNum, fileCoverage) &&
          !isLineCovered(lineNum, fileCoverage)
        ) {
          out.push({ fileName: file.fileName, lineNumber: lineNum });
        }
      }
    }
  }
  return out;
}

/**
 * True only when this line has an LCOV entry (DA/FN/BRDA) with hit 0 or taken 0.
 * Lines with no LCOV entry return false — findUncoveredCodeInPR and the global
 * check both only consider such lines (has entry + uncovered).
 */
function checkCoverage(lineNumber: number, coverageDetails: LcovDetailEntry[]): boolean {
  for (const coverage of coverageDetails) {
    if (coverage.line === lineNumber) {
      if (coverage.hit !== undefined && coverage.hit === 0) return true;
      if (coverage.taken !== undefined && coverage.taken === 0) return true;
    }
  }
  return false;
}

function checkIfLineUncoveredInCoverage(
  lineNumber: number,
  fileCoverage: LcovFile,
  typesToCover: string[]
): UncoveredLine[] {
  const annotations: UncoveredLine[] = [];

  for (const type of typesToCover) {
    let lineExistsAndIsUncovered = false;
    if (type === 'functions') {
      lineExistsAndIsUncovered = checkCoverage(lineNumber, fileCoverage.functions.details);
    } else if (type === 'branches') {
      lineExistsAndIsUncovered = checkCoverage(lineNumber, fileCoverage.branches.details);
    } else if (type === 'lines') {
      lineExistsAndIsUncovered = checkCoverage(lineNumber, fileCoverage.lines.details);
    } else if (type === 'all') {
      if (checkCoverage(lineNumber, fileCoverage.lines.details)) {
        annotations.push({ lineNumber, annotationType: 'lines' });
      }
      if (checkCoverage(lineNumber, fileCoverage.functions.details)) {
        annotations.push({ lineNumber, annotationType: 'functions' });
      }
      if (checkCoverage(lineNumber, fileCoverage.branches.details)) {
        annotations.push({ lineNumber, annotationType: 'branches' });
      }
      continue;
    }

    if (lineExistsAndIsUncovered) {
      annotations.push({ lineNumber, annotationType: type });
    }
  }

  return annotations;
}

export function findUncoveredCodeInPR(
  prData: PrData,
  coverageJSON: LcovFile[],
  typesToCover: string[]
): Promise<UncoveredFiles> {
  return new Promise((resolve) => {
    const filesWithMatches: UncoveredFiles = {};
    prData.forEach((file) => {
      const fileName = file.fileName;
      const fileCoverage = coverageJSON.find((coverageFile) =>
        lcovPathMatchesPrPath(coverageFile.file, fileName)
      );
      if (!fileCoverage) {
        return;
      }
      filesWithMatches[fileName] = [];
      file.data.forEach((change) => {
        const startLine = parseInt(change.lineNumber, 10);
        const endsAfter = parseInt(change.endsAfter, 10) || 1;
        for (let i = 0; i < endsAfter; i++) {
          const currentLineNumber = startLine + i;
          const matches = checkIfLineUncoveredInCoverage(
            currentLineNumber,
            fileCoverage,
            typesToCover
          );
          if (matches.length) {
            matches.forEach((match) => filesWithMatches[fileName].push(match));
          }
        }
      });
      if (filesWithMatches[fileName].length === 0) {
        delete filesWithMatches[fileName];
      }
    });
    resolve(filesWithMatches);
  });
}
