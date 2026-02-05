import { exec, execSync } from 'child_process';
export function getDiffWithLineNumbers(baseBranch) {
    return new Promise((resolve, reject) => {
        exec(`git diff --name-only ${baseBranch}`, (error, stdout) => {
            if (error) {
                reject(error);
                return;
            }
            const files = stdout.split('\n');
            files.pop();
            const prData = [];
            for (const file of files) {
                const regex = /\+([^\n]+)/g;
                let allChangedLines;
                try {
                    allChangedLines = execSync(`git diff --unified=0 ${baseBranch} --ignore-all-space ${file} | grep -E '^\\+\\+\\+' -v | grep -E '^\\+'`).toString();
                }
                catch (err) {
                    console.log(`Seems Like No New Stuff was added in ${file}. Skipping It.`);
                    continue;
                }
                allChangedLines = allChangedLines.trim();
                const linesNos = execSync(`git diff --unified=0 ${baseBranch} --ignore-all-space ${file} | grep -e '^@@' | awk -F'@@' '{print $2}'`).toString();
                const trimmedLines = linesNos.trim();
                const matches = trimmedLines.match(regex)?.map((match) => match.substring(1).trim()) ?? [];
                const data = [];
                const changedLineArray = allChangedLines.split('\n');
                for (const string of matches) {
                    if (string.includes(',')) {
                        const [number, iterations] = string.split(',');
                        if (!isNaN(Number(iterations))) {
                            const count = parseInt(iterations, 10);
                            const dataToConcat = { lineNumber: number, endsAfter: iterations, line: [] };
                            for (let i = 0; i < count; i++) {
                                let lineData = changedLineArray.shift();
                                lineData = lineData ? lineData.replace(/^\+/, '').trim() : undefined;
                                dataToConcat.line.push(lineData ?? '');
                            }
                            data.push(dataToConcat);
                        }
                        else {
                            console.log('Invalid number of iterations');
                        }
                    }
                    else {
                        const lineData = changedLineArray.shift()?.replace(/^\+/, '').trim() ?? '';
                        data.push({ lineNumber: string, endsAfter: '1', line: [lineData] });
                    }
                }
                prData.push({ fileName: file, data });
            }
            resolve(prData);
        });
    });
}
//# sourceMappingURL=git_diff.js.map