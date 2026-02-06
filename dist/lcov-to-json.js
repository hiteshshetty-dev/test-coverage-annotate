"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.coverageReportToJs = coverageReportToJs;
const promises_1 = __importDefault(require("node:fs/promises"));
const node_path_1 = __importDefault(require("node:path"));
const node_https_1 = __importDefault(require("node:https"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const node_child_process_1 = require("node:child_process");
const lcov_parse_1 = __importDefault(require("lcov-parse"));
// Use process.cwd() so this works in both ESM and CJS (bundled action runs from repo root)
const _workDir = process.cwd();
/**
 * Converts a Coverage report .info file to a JavaScript object
 * @param reportFile path to the Coverage Report file or URL
 * @returns Promise containing the parsed data
 */
async function coverageReportToJs(reportFile, noOfCoverageFiles) {
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
                const tempFilePath = node_path_1.default.resolve(_workDir, generateTempFilename(reportFile));
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
        const reportPath = node_path_1.default.resolve(reportFile);
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
        node_https_1.default
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
        (0, node_child_process_1.exec)(command, (error) => {
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
    const directoryPath = node_path_1.default.dirname(filePath);
    console.log('directoryPath ', directoryPath);
    await promises_1.default.mkdir(directoryPath, { recursive: true });
    await promises_1.default.writeFile(filePath, content, 'utf8');
}
async function parseCoverageReport(filePath) {
    console.log('filePath to parse: ', filePath);
    const data = await new Promise((resolve, reject) => {
        (0, lcov_parse_1.default)(filePath, (err, data) => {
            if (err)
                reject(err);
            else
                resolve(data);
        });
    });
    return data;
}
function generateTempFilename(urlStr) {
    const hash = node_crypto_1.default.createHash('md5').update(urlStr).digest('hex');
    return `coverage/coverage_${hash}.info`;
}
