import type { Toolkit } from 'actions-toolkit';
export interface PullRequestRef {
    head: {
        sha: string;
    };
}
interface CreateOrUpdateCheckData {
    started_at?: string;
    status?: string;
    name?: string;
    check_run_id?: number;
    output?: {
        title?: string;
        summary?: string;
        annotations?: Array<{
            path: string;
            start_line: number;
            end_line: number;
            annotation_level: string;
            message: string;
            title?: string;
        }>;
    };
    conclusion?: string;
    completed_at?: string;
}
export declare function createOrUpdateCheck(data: CreateOrUpdateCheckData, checkType: 'create' | 'update', tools: Toolkit, PR: PullRequestRef): Promise<{
    data: {
        id: number;
    };
}>;
export {};
//# sourceMappingURL=check-run.d.ts.map