import type { PrData } from './types.js';

/** File extensions typically instrumented for code coverage. */
const COVERAGE_EXTENSIONS = new Set([
  '.ts',
  '.tsx',
  '.js',
  '.jsx',
  '.mjs',
  '.cjs',
]);

/** Path segments or patterns that indicate a file is not production source (excluded from coverage stats). */
const EXCLUDED_PATTERNS = [
  /__tests__/,
  /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  /\.spec\.(ts|tsx|js|jsx|mjs|cjs)$/i,
  /\.config\.(ts|tsx|js|mjs|cjs)$/i,
  /node_modules/,
  /\/dist\//,
  /\/coverage\//,
  /\.min\.(js|mjs|cjs)$/i,
  /\.d\.ts$/i,
  /\.(md|json|yml|yaml|html|css|scss|lock)$/i,
];

/**
 * Returns true if the file is valid for test coverage (production source that can be covered by unit tests).
 * Excludes test files, config, lock files, and non-source extensions.
 */
export function isFileValidForCoverage(filePath: string): boolean {
  const normalized = filePath.replace(/\\/g, '/');
  const ext = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.')) : '';
  if (!COVERAGE_EXTENSIONS.has(ext)) {
    return false;
  }
  return !EXCLUDED_PATTERNS.some((re) => re.test(normalized));
}

/**
 * Build a matcher from comma-separated patterns. Supported:
 * - Extension: ".ts", ".tsx" — match by file extension
 * - Glob: "*.ts", "*.js" — match if path ends with the suffix
 * - Path segment: "src/", "generated" — match if path contains or ends with the segment
 * - Segment glob: pattern like double-star/slash/path/double-star — match if path contains the middle segment
 */
function parsePatterns(
  input: string,
  matchWhenEmpty: boolean
): (path: string) => boolean {
  const parts = input
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (parts.length === 0) return () => matchWhenEmpty;

  return (path: string) => {
    const normalized = path.replace(/\\/g, '/').toLowerCase();
    const ext = normalized.includes('.') ? normalized.slice(normalized.lastIndexOf('.')) : '';
    return parts.some((p) => {
      if (p.startsWith('**/') && p.endsWith('/**')) {
        const segment = p.slice(3, -3);
        return segment ? normalized.includes(segment) : true;
      }
      if (p.startsWith('**/')) {
        const segment = p.slice(3);
        return segment ? normalized.includes(segment) || normalized.endsWith(segment) : true;
      }
      if (p.startsWith('*')) return normalized.endsWith(p.slice(1)) || ext === p.slice(1);
      if (p.startsWith('.')) return ext === p;
      return normalized.includes(p) || normalized.endsWith(p);
    });
  };
}

export interface CoverageFilesFilterOptions {
  /** Comma-separated include patterns (e.g. ".ts,.tsx,*.js"). If set, only files matching one of these pass. */
  include?: string;
  /** Comma-separated exclude patterns (e.g. "generated/,.d.ts"). If set, files matching any of these are excluded. */
  exclude?: string;
}

/**
 * Filter PR diff data to only files that are valid for test coverage.
 * Applies: default valid-for-coverage rules, then optional include, then optional exclude.
 */
export function filterPrDataForCoverage(
  prData: PrData,
  options?: string | CoverageFilesFilterOptions
): PrData {
  return filterPrDataForCoverageWithReasons(prData, options).included;
}

export interface ExcludedFileReason {
  fileName: string;
  reason:
    | 'not_valid_for_coverage'
    | 'did_not_match_include'
    | 'matched_exclude';
}

export interface FilterPrDataResult {
  included: PrData;
  excluded: ExcludedFileReason[];
}

/**
 * Same as filterPrDataForCoverage but returns which files were excluded and why.
 * Useful for debugging: "considered" = included, "ignored" = excluded with reason.
 */
export function filterPrDataForCoverageWithReasons(
  prData: PrData,
  options?: string | CoverageFilesFilterOptions
): FilterPrDataResult {
  const opts: CoverageFilesFilterOptions =
    typeof options === 'string' ? { include: options } : options ?? {};
  const includeFn = parsePatterns(opts.include ?? '', true);
  const excludeFn = parsePatterns(opts.exclude ?? '', false);
  const included: PrData = [];
  const excluded: ExcludedFileReason[] = [];
  for (const file of prData) {
    if (!isFileValidForCoverage(file.fileName)) {
      excluded.push({ fileName: file.fileName, reason: 'not_valid_for_coverage' });
      continue;
    }
    if (!includeFn(file.fileName)) {
      excluded.push({ fileName: file.fileName, reason: 'did_not_match_include' });
      continue;
    }
    if (excludeFn(file.fileName)) {
      excluded.push({ fileName: file.fileName, reason: 'matched_exclude' });
      continue;
    }
    included.push(file);
  }
  return { included, excluded };
}
