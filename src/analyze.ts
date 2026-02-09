import type { PrData, LcovFile, UncoveredFiles, UncoveredLine, LcovDetailEntry } from './types.js';

/** Result of new-lines coverage stats for threshold check. */
export interface NewLinesCoverageStats {
  totalNewLines: number;
  coveredNewLines: number;
}

export function isLineCovered(lineNumber: number, fileCoverage: LcovFile): boolean {
  for (const entry of fileCoverage.lines.details) {
    if (entry.line === lineNumber) {
      return (entry.hit ?? 0) > 0;
    }
  }
  return false;
}

/** Compute how many new (changed) lines are covered by tests. Used for threshold check. */
export function getNewLinesCoverageStats(
  prData: PrData,
  coverageJSON: LcovFile[]
): NewLinesCoverageStats {
  let totalNewLines = 0;
  let coveredNewLines = 0;
  for (const file of prData) {
    const fileCoverage = coverageJSON.find((c) => c.file.includes(file.fileName));
    for (const change of file.data) {
      const startLine = parseInt(change.lineNumber, 10);
      const count = parseInt(change.endsAfter, 10) || 1;
      for (let i = 0; i < count; i++) {
        const lineNum = startLine + i;
        totalNewLines += 1;
        if (fileCoverage && isLineCovered(lineNum, fileCoverage)) {
          coveredNewLines += 1;
        }
      }
    }
  }
  return { totalNewLines, coveredNewLines };
}

/** All new lines that are not counted as covered (same logic as getNewLinesCoverageStats). */
export function getUncoveredNewLineNumbers(
  prData: PrData,
  coverageJSON: LcovFile[]
): { fileName: string; lineNumber: number }[] {
  const out: { fileName: string; lineNumber: number }[] = [];
  for (const file of prData) {
    const fileCoverage = coverageJSON.find((c) => c.file.includes(file.fileName));
    for (const change of file.data) {
      const startLine = parseInt(change.lineNumber, 10);
      const count = parseInt(change.endsAfter, 10) || 1;
      for (let i = 0; i < count; i++) {
        const lineNum = startLine + i;
        const covered = fileCoverage && isLineCovered(lineNum, fileCoverage);
        if (!covered) {
          out.push({ fileName: file.fileName, lineNumber: lineNum });
        }
      }
    }
  }
  return out;
}

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
        coverageFile.file.includes(fileName)
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
