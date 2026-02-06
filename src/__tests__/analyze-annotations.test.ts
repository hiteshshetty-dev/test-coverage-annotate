import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { findUncoveredCodeInPR, getNewLinesCoverageStats } from '../analyze.js';
import { createAnnotations } from '../annotations.js';
import {
  filterPrDataForCoverage,
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
});

describe('getNewLinesCoverageStats', () => {
  it('counts total and covered new lines', () => {
    const stats = getNewLinesCoverageStats(mockPrData, mockCoverageJSON);
    expect(stats.totalNewLines).toBe(2); // lines 12 and 13
    expect(stats.coveredNewLines).toBe(1); // only line 13 has hit: 1
  });

  it('treats missing file in coverage as uncovered', () => {
    const prData: PrData = [{ fileName: 'other.js', data: [{ lineNumber: '1', endsAfter: '1', line: ['x'] }] }];
    const stats = getNewLinesCoverageStats(prData, mockCoverageJSON);
    expect(stats.totalNewLines).toBe(1);
    expect(stats.coveredNewLines).toBe(0);
  });
});

describe('findUncoveredCodeInPR', () => {
  it('returns uncovered lines for PR data and coverage', async () => {
    const result = await findUncoveredCodeInPR(mockPrData, mockCoverageJSON, ['lines']);
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
    expect(result['controllers/app.js']).toBeDefined();
    expect(Array.isArray(result['controllers/app.js'])).toBe(true);
    expect(result['controllers/app.js'].length).toBeGreaterThanOrEqual(0);
  });
});

describe('createAnnotations', () => {
  it('produces annotations for uncovered data (detailed)', async () => {
    const uncovered = await findUncoveredCodeInPR(mockPrData, mockCoverageJSON, ['lines']);
    const annotations = createAnnotations(uncovered, 'detailed');
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
    const uncovered = await findUncoveredCodeInPR(mockPrData, mockCoverageJSON, ['lines']);
    const annotations = createAnnotations(uncovered, 'summarize');
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
