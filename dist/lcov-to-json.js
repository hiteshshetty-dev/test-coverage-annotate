import fs from 'node:fs/promises';
import path from 'node:path';
import https from 'node:https';
import crypto from 'node:crypto';
import { exec } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(import.meta.url);
const parse = require('lcov-parse');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
/**
 * Converts a Coverage report .info file to a JavaScript object
 * @param reportFile path to the Coverage Report file or URL
 * @returns Promise containing the parsed data
 */
export async function coverageReportToJs(reportFile, noOfCoverageFiles) {
    if (isURL(reportFile)) {
        if (isS3Directory(reportFile)) {
            const match = reportFile.match(/\/coverage\/(\d+)\/$/);
            if (!match)
                throw new Error(`Invalid S3 coverage URL: ${reportFile}`);
            const buildNumber = match[1];
            const count = parseInt(noOfCoverageFiles, 10) || 1;
            for (let i = 1; i <= count; i++) {
                const fileUrl = `${reportFile}${buildNumber}.${i}.info`;
                const content = await fetchContentFromURL(fileUrl);
                const filePath = `coverage/${buildNumber}.${i}.info`;
                await saveContentToLocalFile(filePath, content);
            }
            const mergedFilePath = await executeLcovResultMerger(`coverage/${buildNumber}.*.info`, `coverage/${buildNumber}_merged.info`);
            return await parseCoverageReport(mergedFilePath);
        }
        else {
            try {
                const content = await fetchContentFromURL(reportFile);
                const tempFilePath = path.resolve(__dirname, generateTempFilename(reportFile));
                console.log('**path**', tempFilePath);
                await saveContentToLocalFile(tempFilePath, content);
                return await parseCoverageReport(tempFilePath);
            }
            catch (err) {
                throw new Error(`Error fetching content from URL: ${err.message}`);
            }
        }
    }
    else {
        const reportPath = path.resolve(reportFile);
        console.log('**path**', reportPath);
        try {
            return await parseCoverageReport(reportPath);
        }
        catch (err) {
            throw new Error(`Error parsing coverage report: ${err.message}`);
        }
    }
}
function isURL(str) {
    return /^(http|https):\/\//.test(str);
}
function isS3Directory(urlStr) {
    const s3PathRegex = /^https:\/\/[\w.-]+\.s3\.amazonaws\.com\/([^?#]+\/)$/;
    return s3PathRegex.test(urlStr);
}
function fetchContentFromURL(urlStr) {
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
function executeLcovResultMerger(inputPattern, outputFilePath) {
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
async function saveContentToLocalFile(filePath, content) {
    const directoryPath = path.dirname(filePath);
    console.log('directoryPath ', directoryPath);
    await fs.mkdir(directoryPath, { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
}
async function parseCoverageReport(filePath) {
    console.log('filePath to parse: ', filePath);
    const data = await new Promise((resolve, reject) => {
        parse(filePath, (err, data) => {
            if (err)
                reject(err);
            else
                resolve(data);
        });
    });
    return data;
}
function generateTempFilename(urlStr) {
    const hash = crypto.createHash('md5').update(urlStr).digest('hex');
    return `coverage/coverage_${hash}.info`;
}
//# sourceMappingURL=lcov-to-json.js.map