/**
 * Shared types for the PR Coverage Annotations action.
 */

/** Single changed line hunk from git diff (lineNumber, count, content). */
export interface ChangedLine {
  lineNumber: string;
  endsAfter: string;
  line: string[];
}

/** One file's changed lines. */
export interface PrFile {
  fileName: string;
  data: ChangedLine[];
}

/** Full PR diff data: list of files with their changed lines. */
export type PrData = PrFile[];

/** LCOV coverage detail entry (line/function/branch). */
export interface LcovDetailEntry {
  line?: number;
  hit?: number;
  taken?: number;
}

/** LCOV file coverage (lines, functions, branches). */
export interface LcovFile {
  file: string;
  lines: { details: LcovDetailEntry[] };
  functions: { details: LcovDetailEntry[] };
  branches: { details: LcovDetailEntry[] };
}

/** One uncovered line/function/branch in a file. */
export interface UncoveredLine {
  lineNumber: number;
  annotationType: string;
}

/** Map of file path to list of uncovered items. */
export type UncoveredFiles = Record<string, UncoveredLine[]>;

/** GitHub Checks API annotation shape. */
export interface Annotation {
  path: string;
  start_line: number;
  end_line: number;
  annotation_level: 'failure' | 'warning' | 'notice';
  message: string;
  title?: string;
}
