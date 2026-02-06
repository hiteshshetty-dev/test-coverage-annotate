import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import type { LcovFile } from './types.js';

// Use process.cwd() so this works in both ESM and CJS (bundled action runs from repo root)
const _workDir = process.cwd();

/** Inline LCOV parser (no lcov-parse dep) so ncc bundles everything. */
interface LcovItem {
  file: string;
  lines: { found: number; hit: number; details: Array<{ line?: number; hit?: number }> };
  functions: { found: number; hit: number; details: Array<{ name?: string; line?: number; hit?: number }> };
  branches: { found: number; hit: number; details: Array<{ line?: number; block?: number; branch?: number; taken?: number }> };
}

function walkLcov(str: string, cb: (err: Error | null, data: LcovFile[]) => void): void {
  const data: LcovItem[] = [];
  let item: LcovItem = {
    lines: { found: 0, hit: 0, details: [] },
    functions: { found: 0, hit: 0, details: [] },
    branches: { found: 0, hit: 0, details: [] },
    file: '',
  };

  ['end_of_record'].concat(str.split('\n')).forEach((line) => {
    line = line.trim();
    const allparts = line.split(':');
    const parts = [allparts.shift(), allparts.join(':')] as [string, string];
    let lineParts: string[];
    let fn: string[];

    switch (parts[0].toUpperCase()) {
      case 'SF':
        item.file = parts[1].trim();
        break;
      case 'FNF':
        item.functions.found = Number(parts[1].trim());
        break;
      case 'FNH':
        item.functions.hit = Number(parts[1].trim());
        break;
      case 'LF':
        item.lines.found = Number(parts[1].trim());
        break;
      case 'LH':
        item.lines.hit = Number(parts[1].trim());
        break;
      case 'DA':
        lineParts = parts[1].split(',');
        item.lines.details.push({ line: Number(lineParts[0]), hit: Number(lineParts[1]) });
        break;
      case 'FN':
        fn = parts[1].split(',');
        item.functions.details.push({ name: fn[1], line: Number(fn[0]) });
        break;
      case 'FNDA':
        fn = parts[1].split(',');
        item.functions.details.some((i, k) => {
          if (i.name === fn[1] && i.hit === undefined) {
            (item.functions.details[k] as { hit?: number }).hit = Number(fn[0]);
            return true;
          }
          return false;
        });
        break;
      case 'BRDA':
        fn = parts[1].split(',');
        item.branches.details.push({
          line: Number(fn[0]),
          block: Number(fn[1]),
          branch: Number(fn[2]),
          taken: fn[3] === '-' ? 0 : Number(fn[3]),
        });
        break;
      case 'BRF':
        item.branches.found = Number(parts[1]);
        break;
      case 'BRH':
        item.branches.hit = Number(parts[1]);
        break;
      default:
        break;
    }

    if (line.indexOf('end_of_record') > -1) {
      data.push({ ...item });
      item = {
        lines: { found: 0, hit: 0, details: [] },
        functions: { found: 0, hit: 0, details: [] },
        branches: { found: 0, hit: 0, details: [] },
        file: '',
      };
    }
  });

  data.shift();
  if (data.length) cb(null, data as LcovFile[]);
  else cb(new Error('Failed to parse string'), []);
}

function parseLcovFile(file: string, cb: (err: Error | null, data: LcovFile[]) => void): void {
  fsSync.readFile(file, 'utf8', (err, str) => {
    if (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return walkLcov(file, cb);
      cb(err, []);
      return;
    }
    walkLcov(str, cb);
  });
}

/**
 * Converts a Coverage report .info file to a JavaScript object
 * @param reportFile path to the Coverage Report file or URL
 * @returns Promise containing the parsed data
 */
export async function coverageReportToJs(
  reportFile: string,
  noOfCoverageFiles: string
): Promise<LcovFile[]> {
  if (isURL(reportFile)) {
    if (isS3Directory(reportFile)) {
      const match = reportFile.match(/\/coverage\/(\d+)\/$/);
      if (!match) throw new Error(`Invalid S3 coverage URL: ${reportFile}`);
      const buildNumber = match[1];
      const count = parseInt(noOfCoverageFiles, 10) || 1;
      for (let i = 1; i <= count; i++) {
        const fileUrl = `${reportFile}${buildNumber}.${i}.info`;
        const content = await fetchContentFromURL(fileUrl);
        const filePath = `coverage/${buildNumber}.${i}.info`;
        await saveContentToLocalFile(filePath, content);
      }
      const mergedFilePath = await executeLcovResultMerger(
        `coverage/${buildNumber}.*.info`,
        `coverage/${buildNumber}_merged.info`
      );
      return await parseCoverageReport(mergedFilePath);
    } else {
      try {
        const content = await fetchContentFromURL(reportFile);
        const tempFilePath = path.resolve(_workDir, generateTempFilename(reportFile));
        console.log('**path**', tempFilePath);
        await saveContentToLocalFile(tempFilePath, content);
        return await parseCoverageReport(tempFilePath);
      } catch (err) {
        throw new Error(`Error fetching content from URL: ${(err as Error).message}`);
      }
    }
  } else {
    const reportPath = path.resolve(reportFile);
    console.log('**path**', reportPath);
    try {
      return await parseCoverageReport(reportPath);
    } catch (err) {
      throw new Error(`Error parsing coverage report: ${(err as Error).message}`);
    }
  }
}

function isURL(str: string): boolean {
  return /^(http|https):\/\//.test(str);
}

function isS3Directory(urlStr: string): boolean {
  const s3PathRegex = /^https:\/\/[\w.-]+\.s3\.amazonaws\.com\/([^?#]+\/)$/;
  return s3PathRegex.test(urlStr);
}

function fetchContentFromURL(urlStr: string): Promise<string> {
  console.log(`** fetching File from URL: ${urlStr} **`);
  return new Promise((resolve, reject) => {
    https
      .get(urlStr, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
      })
      .on('error', reject);
  });
}

function executeLcovResultMerger(inputPattern: string, outputFilePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const command = `npx lcov-result-merger '${inputPattern}' '${outputFilePath}'`;
    console.log('command: ', command);
    exec(command, (error) => {
      if (error) {
        console.log('failed to merge: ', error);
        reject(error);
        return;
      }
      resolve(outputFilePath);
    });
  });
}

async function saveContentToLocalFile(filePath: string, content: string): Promise<void> {
  const directoryPath = path.dirname(filePath);
  console.log('directoryPath ', directoryPath);
  await fs.mkdir(directoryPath, { recursive: true });
  await fs.writeFile(filePath, content, 'utf8');
}

async function parseCoverageReport(filePath: string): Promise<LcovFile[]> {
  console.log('filePath to parse: ', filePath);
  const data = await new Promise<LcovFile[]>((resolve, reject) => {
    parseLcovFile(filePath, (err: Error | null, data: LcovFile[]) => {
      if (err) reject(err);
      else resolve(data);
    });
  });
  return data;
}

function generateTempFilename(urlStr: string): string {
  const hash = crypto.createHash('md5').update(urlStr).digest('hex');
  return `coverage/coverage_${hash}.info`;
}
