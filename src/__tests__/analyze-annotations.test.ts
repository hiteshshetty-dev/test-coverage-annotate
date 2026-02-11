import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import {
  findUncoveredCodeInPR,
  getNewLinesCoverageStats,
  getUncoveredNewLineNumbers,
  lcovPathMatchesPrPath,
} from '../analyze.js';
import { createAnnotations } from '../annotations.js';
import {
  filterPrDataForCoverage,
  filterPrDataForCoverageWithReasons,
  isFileValidForCoverage,
} from '../coverage-files.js';
import { coverageReportToJs } from '../lcov-to-json.js';
import type { PrData, LcovFile } from '../types.js';

const mockPrData: PrData = [
  {
    fileName: 'controllers/app.js',
    data: [
      {
        lineNumber: '12',
        endsAfter: '2',
        line: ['function dummyUncovered(x,y) {', '  return x ? x : y;'],
      },
    ],
  },
];

const mockCoverageJSON: LcovFile[] = [
  {
    file: '/repo/controllers/app.js',
    lines: {
      details: [
        { line: 12, hit: 0 },
        { line: 13, hit: 1 },
      ],
    },
    functions: { details: [] },
    branches: { details: [] },
  },
];

describe('coverage-files filter', () => {
  it('includes production source files', () => {
    expect(isFileValidForCoverage('src/index.ts')).toBe(true);
    expect(isFileValidForCoverage('lib/app.js')).toBe(true);
    expect(isFileValidForCoverage('controllers/app.js')).toBe(true);
  });

  it('excludes test/spec and config files', () => {
    expect(isFileValidForCoverage('src/__tests__/foo.test.ts')).toBe(false);
    expect(isFileValidForCoverage('foo.spec.js')).toBe(false);
    expect(isFileValidForCoverage('vite.config.ts')).toBe(false);
    expect(isFileValidForCoverage('README.md')).toBe(false);
    expect(isFileValidForCoverage('package.json')).toBe(false);
  });

  it('filterPrDataForCoverage keeps only valid files', () => {
    const prData: PrData = [
      { fileName: 'src/foo.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] },
      { fileName: 'README.md', data: [{ lineNumber: '1', endsAfter: '2', line: ['a', 'b'] }] },
      { fileName: 'bar.test.js', data: [{ lineNumber: '1', endsAfter: '1', line: ['y'] }] },
    ];
    const filtered = filterPrDataForCoverage(prData);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fileName).toBe('src/foo.ts');
  });

  it('filterPrDataForCoverage respects exclude pattern', () => {
    const prData: PrData = [
      { fileName: 'src/foo.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] },
      { fileName: 'src/generated/api.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['y'] }] },
    ];
    const filtered = filterPrDataForCoverage(prData, { exclude: 'generated/' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fileName).toBe('src/foo.ts');
  });

  it('filterPrDataForCoverage respects include and exclude together', () => {
    const prData: PrData = [
      { fileName: 'src/a.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] },
      { fileName: 'src/b.js', data: [{ lineNumber: '1', endsAfter: '1', line: ['y'] }] },
      { fileName: 'src/skip.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['z'] }] },
    ];
    const filtered = filterPrDataForCoverage(prData, {
      include: '.ts',
      exclude: 'skip',
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fileName).toBe('src/a.ts');
  });

  it('filterPrDataForCoverage supports **/ path segment in include', () => {
    const prData: PrData = [
      { fileName: 'src/lib/foo.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] },
      { fileName: 'scripts/bar.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['y'] }] },
    ];
    const filtered = filterPrDataForCoverage(prData, { include: '**/src/**' });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].fileName).toBe('src/lib/foo.ts');
  });

  it('filterPrDataForCoverage returns empty when include pattern matches no files', () => {
    const prData: PrData = [
      { fileName: 'src/foo.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] },
      { fileName: 'src/bar.js', data: [{ lineNumber: '1', endsAfter: '1', line: ['y'] }] },
    ];
    const filtered = filterPrDataForCoverage(prData, { include: '.py,.rb' });
    expect(filtered).toHaveLength(0);
    // In the action: totalNewLines=0, coveredNewLines=0, meetsThreshold=true, and we show "No files matched the coverage filters"
    const stats = getNewLinesCoverageStats(filtered, mockCoverageJSON);
    expect(stats.totalNewLines).toBe(0);
    expect(stats.coveredNewLines).toBe(0);
  });

  it('filterPrDataForCoverageWithReasons returns included and excluded with reasons', () => {
    const prData: PrData = [
      { fileName: 'src/foo.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] },
      { fileName: 'README.md', data: [{ lineNumber: '1', endsAfter: '1', line: ['a'] }] },
      { fileName: 'src/generated/api.ts', data: [{ lineNumber: '1', endsAfter: '1', line: ['y'] }] },
    ];
    const result = filterPrDataForCoverageWithReasons(prData, {
      include: '.ts',
      exclude: 'generated/',
    });
    expect(result.included).toHaveLength(1);
    expect(result.included[0].fileName).toBe('src/foo.ts');
    expect(result.excluded).toHaveLength(2);
    const readme = result.excluded.find((e) => e.fileName === 'README.md');
    const generated = result.excluded.find((e) => e.fileName === 'src/generated/api.ts');
    expect(readme?.reason).toBe('not_valid_for_coverage');
    expect(generated?.reason).toBe('matched_exclude');
  });
});

describe('getNewLinesCoverageStats', () => {
  it('counts total and covered new lines', () => {
    const stats = getNewLinesCoverageStats(mockPrData, mockCoverageJSON);
    expect(stats.totalNewLines).toBe(2); // lines 12 and 13
    expect(stats.coveredNewLines).toBe(1); // only line 13 has hit: 1
  });

  it('ignores new lines when file is missing from coverage (same as annotations)', () => {
    const prData: PrData = [{ fileName: 'other.js', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] }];
    const stats = getNewLinesCoverageStats(prData, mockCoverageJSON);
    expect(stats.totalNewLines).toBe(0);
    expect(stats.coveredNewLines).toBe(0);
  });
});

describe('lcovPathMatchesPrPath', () => {
  it('matches when paths are equal', () => {
    expect(lcovPathMatchesPrPath('src/foo.ts', 'src/foo.ts')).toBe(true);
  });
  it('matches when PR path ends with LCOV path (monorepo: LCOV relative to package)', () => {
    expect(
      lcovPathMatchesPrPath(
        'src/common/hooks/usePostMessageEvents.hooks.ts',
        'visual-editor-projects/visual-editor/src/common/hooks/usePostMessageEvents.hooks.ts'
      )
    ).toBe(true);
  });
  it('matches when LCOV path ends with PR path', () => {
    expect(lcovPathMatchesPrPath('/repo/controllers/app.js', 'controllers/app.js')).toBe(true);
  });
  it('does not match unrelated paths', () => {
    expect(lcovPathMatchesPrPath('src/other.ts', 'src/foo.ts')).toBe(false);
    expect(lcovPathMatchesPrPath('src/foo.ts', 'src/foo.ts.bak')).toBe(false);
  });
});

describe('getUncoveredNewLineNumbers', () => {
  it('returns every new line not included in coveredNewLines', () => {
    const list = getUncoveredNewLineNumbers(mockPrData, mockCoverageJSON);
    expect(list).toHaveLength(1);
    expect(list[0]).toEqual({ fileName: 'controllers/app.js', lineNumber: 12 });
  });

  it('omits lines when file is missing from coverage (same set as annotations)', () => {
    const prData: PrData = [{ fileName: 'other.js', data: [{ lineNumber: '5', endsAfter: '2', line: ['a', 'b'] }] }];
    const list = getUncoveredNewLineNumbers(prData, mockCoverageJSON);
    expect(list).toHaveLength(0);
  });
});

describe('findUncoveredCodeInPR', () => {
  it('returns uncovered lines and total/covered new lines for percentage', async () => {
    const result = await findUncoveredCodeInPR(mockPrData, mockCoverageJSON, ['lines']);
    expect(result.untestedLinesOfFiles).toBeDefined();
    expect(result.untestedLinesOfFiles['controllers/app.js']).toBeDefined();
    expect(Array.isArray(result.untestedLinesOfFiles['controllers/app.js'])).toBe(true);
    expect(result.totalNewLines).toBe(2); // lines 12 and 13 have DA entry
    expect(result.coveredNewLines).toBe(1); // only line 13 has hit > 0
  });
});

describe('createAnnotations', () => {
  it('produces annotations for uncovered data (detailed)', async () => {
    const { untestedLinesOfFiles } = await findUncoveredCodeInPR(mockPrData, mockCoverageJSON, ['lines']);
    const annotations = createAnnotations(untestedLinesOfFiles, 'detailed');
    expect(annotations).toBeDefined();
    expect(Array.isArray(annotations)).toBe(true);
    expect(annotations.length).toBeGreaterThanOrEqual(0);
    annotations.forEach((a) => {
      expect(a).toHaveProperty('path');
      expect(a).toHaveProperty('start_line');
      expect(a).toHaveProperty('end_line');
      expect(a).toHaveProperty('annotation_level', 'failure');
      expect(a).toHaveProperty('message');
    });
  });

  it('produces annotations for uncovered data (summarize)', async () => {
    const { untestedLinesOfFiles } = await findUncoveredCodeInPR(mockPrData, mockCoverageJSON, ['lines']);
    const annotations = createAnnotations(untestedLinesOfFiles, 'summarize');
    expect(annotations).toBeDefined();
    expect(Array.isArray(annotations)).toBe(true);
    annotations.forEach((a) => {
      expect(a).toHaveProperty('path');
      expect(a).toHaveProperty('message');
      expect(a).toHaveProperty('title');
    });
  });
});

describe('coverageReportToJs', () => {
  it('parses local lcov.info when file exists', async () => {
    const lcovPath = resolve(process.cwd(), 'lcov.info');
    if (!existsSync(lcovPath)) {
      return; // skip when fixture not present (e.g. CI without committed lcov.info)
    }
    const parsed = await coverageReportToJs(lcovPath, '1');
    expect(Array.isArray(parsed)).toBe(true);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty('file');
      expect(parsed[0]).toHaveProperty('lines');
      expect(parsed[0]).toHaveProperty('functions');
      expect(parsed[0]).toHaveProperty('branches');
    }
  });
});
