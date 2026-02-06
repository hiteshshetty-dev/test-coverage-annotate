"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createOrUpdateCheck = createOrUpdateCheck;
async function createOrUpdateCheck(data, checkType, tools, PR) {
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
        return await tools.github.checks.create(checkData);
    }
    else {
        return await tools.github.checks.update(checkData);
    }
}
