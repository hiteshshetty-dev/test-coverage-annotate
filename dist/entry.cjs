"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const core = __importStar(require("@actions/core"));
const rest_1 = require("@octokit/rest");
const node_fetch_1 = __importDefault(require("node-fetch"));
const actions_toolkit_1 = require("actions-toolkit");
const git_diff_js_1 = require("./git_diff.js");
const lcov_to_json_js_1 = require("./lcov-to-json.js");
const analyze_js_1 = require("./analyze.js");
const annotations_js_1 = require("./annotations.js");
/** Inlined so ncc CJS bundle assigns to the correct module.exports (avoids createOrUpdateCheck is not a function). */
async function createOrUpdateCheck(data, checkType, tools, PR) {
    const defaultCheckAttributes = {
        owner: tools.context.repo.owner,
        repo: tools.context.repo.repo,
        head_sha: PR.head.sha,
        mediaType: { previews: ['antiope'] },
    };
    const checkData = { ...defaultCheckAttributes, ...data };
    if (checkType === 'create') {
        return await tools.github.checks.create(checkData);
    }
    return await tools.github.checks.update(checkData);
}
actions_toolkit_1.Toolkit.run(async (tools) => {
    try {
        const githubToken = core.getInput('token');
        const octokit = new rest_1.Octokit({
            previews: ['antiope'],
            auth: githubToken,
            request: { fetch: node_fetch_1.default },
        });
        const toolkit = new actions_toolkit_1.Toolkit({ token: githubToken });
        const createData = {
            started_at: new Date().toISOString(),
            status: 'in_progress',
            name: 'Test Coverage Annotate',
        };
        const eventType = core.getInput('action-type');
        console.log('eventType:', eventType);
        let PR;
        if (eventType === 'workflow_dispatch') {
            const payload = toolkit.context.payload;
            const prNumber = payload.inputs?.pr_number;
            if (prNumber == null)
                throw new Error('workflow_dispatch requires inputs.pr_number');
            const res = await octokit.pulls.get({
                owner: toolkit.context.repo.owner,
                repo: toolkit.context.repo.repo,
                pull_number: prNumber,
            });
            PR = res.data;
        }
        else {
            PR = toolkit.context.payload.pull_request;
        }
        const response = await createOrUpdateCheck(createData, 'create', toolkit, PR);
        const check_id = response.data.id;
        console.log('Check Successfully Created', check_id);
        const prData = await (0, git_diff_js_1.getDiffWithLineNumbers)('HEAD^1');
        const coverageReportPath = core.getInput('coverage-info-path');
        const noOfCoverageFiles = core.getInput('total-coverage-files');
        const coverageJSON = await (0, lcov_to_json_js_1.coverageReportToJs)(coverageReportPath, noOfCoverageFiles);
        const typesToCoverInput = core.getInput('annotation-type');
        const typesToCover = typesToCoverInput.split(',').map((item) => item.trim());
        const untestedLinesOfFiles = await (0, analyze_js_1.findUncoveredCodeInPR)(prData, coverageJSON, typesToCover);
        const coverageType = core.getInput('annotation-coverage');
        const annotations = (0, annotations_js_1.createAnnotations)(untestedLinesOfFiles, coverageType);
        const totalFiles = Object.keys(untestedLinesOfFiles).length;
        const totalWarnings = annotations.length;
        const updateData = {
            check_run_id: check_id,
            output: {
                title: 'Test Coverage Annotate🔎',
            },
        };
        if (annotations.length === 0) {
            updateData.output.summary =
                'All Good! We found No Uncovered Lines of Code in your Pull Request.🚀';
        }
        else {
            let summary = `### Found a Total of ${totalWarnings} Instances of Uncovered Code in ${totalFiles} Files!⚠️\n\n`;
            summary += 'File Name | No. of Warnings\n';
            summary += '--------- | ---------------\n';
            Object.entries(untestedLinesOfFiles).forEach(([filename, untestedStuffArray]) => {
                summary += `${filename} | ${untestedStuffArray.length}\n`;
            });
            updateData.output.summary = summary;
        }
        const leftAnnotations = [...annotations];
        while (leftAnnotations.length > 0) {
            const toProcess = leftAnnotations.splice(0, 50);
            updateData.output.annotations = toProcess;
            await createOrUpdateCheck(updateData, 'update', toolkit, PR);
            console.log('Check Successfully Updated.');
        }
        const completeData = {
            ...updateData,
            conclusion: 'success',
            status: 'completed',
            completed_at: new Date().toISOString(),
        };
        delete completeData.output.annotations;
        await createOrUpdateCheck(completeData, 'update', toolkit, PR);
        console.log('Check Successfully Closed');
    }
    catch (error) {
        tools.exit.failure(error.message);
    }
    tools.exit.success('PR Scan and Warn Analysis completed successfully!');
});
