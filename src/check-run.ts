import type { Toolkit } from 'actions-toolkit';

export interface PullRequestRef {
  head: { sha: string };
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

export async function createOrUpdateCheck(
  data: CreateOrUpdateCheckData,
  checkType: 'create' | 'update',
  tools: Toolkit,
  PR: PullRequestRef
): Promise<{ data: { id: number } }> {
  const defaultCheckAttributes = {
    owner: tools.context.repo.owner,
    repo: tools.context.repo.repo,
    head_sha: PR.head.sha,
    mediaType: {
      previews: ['antiope'],
    },
  };

  const checkData = { ...defaultCheckAttributes, ...data };

  if (checkType === 'create') {
    return await tools.github.checks.create(checkData as unknown as Parameters<typeof tools.github.checks.create>[0]);
  } else {
    return await tools.github.checks.update(checkData as unknown as Parameters<typeof tools.github.checks.update>[0]);
  }
}
