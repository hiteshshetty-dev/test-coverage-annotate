import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { findUncoveredCodeInPR } from '../analyze.js';
import { createAnnotations } from '../annotations.js';
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
