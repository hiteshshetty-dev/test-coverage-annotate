import type { LcovFile } from './types.js';
/**
 * Converts a Coverage report .info file to a JavaScript object
 * @param reportFile path to the Coverage Report file or URL
 * @returns Promise containing the parsed data
 */
export declare function coverageReportToJs(reportFile: string, noOfCoverageFiles: string): Promise<LcovFile[]>;
//# sourceMappingURL=lcov-to-json.d.ts.map