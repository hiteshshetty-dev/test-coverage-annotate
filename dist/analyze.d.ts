import type { PrData, LcovFile, UncoveredFiles } from './types.js';
export declare function findUncoveredCodeInPR(prData: PrData, coverageJSON: LcovFile[], typesToCover: string[]): Promise<UncoveredFiles>;
//# sourceMappingURL=analyze.d.ts.map