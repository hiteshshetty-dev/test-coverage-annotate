function checkCoverage(lineNumber, coverageDetails) {
    console.log(`lineNumber: ${lineNumber}`);
    for (const coverage of coverageDetails) {
        if (coverage.line === lineNumber) {
            console.log(`matched::: line: ${lineNumber}, hit: ${coverage.hit}, taken: ${coverage.taken}`);
            if (coverage.hit !== undefined && coverage.hit === 0)
                return true;
            if (coverage.taken !== undefined && coverage.taken === 0)
                return true;
        }
    }
    return false;
}
function checkIfLineUncoveredInCoverage(lineNumber, fileCoverage, typesToCover) {
    const annotations = [];
    for (const type of typesToCover) {
        let lineExistsAndIsUncovered = false;
        if (type === 'functions') {
            lineExistsAndIsUncovered = checkCoverage(lineNumber, fileCoverage.functions.details);
        }
        else if (type === 'branches') {
            lineExistsAndIsUncovered = checkCoverage(lineNumber, fileCoverage.branches.details);
        }
        else if (type === 'lines') {
            lineExistsAndIsUncovered = checkCoverage(lineNumber, fileCoverage.lines.details);
        }
        else if (type === 'all') {
            if (checkCoverage(lineNumber, fileCoverage.lines.details)) {
                annotations.push({ lineNumber, annotationType: 'lines' });
            }
            if (checkCoverage(lineNumber, fileCoverage.functions.details)) {
                annotations.push({ lineNumber, annotationType: 'functions' });
            }
            if (checkCoverage(lineNumber, fileCoverage.branches.details)) {
                annotations.push({ lineNumber, annotationType: 'branches' });
            }
            continue;
        }
        if (lineExistsAndIsUncovered) {
            annotations.push({ lineNumber, annotationType: type });
        }
    }
    return annotations;
}
export function findUncoveredCodeInPR(prData, coverageJSON, typesToCover) {
    return new Promise((resolve) => {
        const filesWithMatches = {};
        prData.forEach((file) => {
            const fileName = file.fileName;
            const fileCoverage = coverageJSON.find((coverageFile) => coverageFile.file.includes(fileName));
            if (!fileCoverage) {
                console.log(`File ${fileName} Not Found in Coverage Data.`);
                return;
            }
            console.log(`File ${fileName} was found in Coverage Data!!`);
            console.log('Data: ', file.data);
            filesWithMatches[fileName] = [];
            file.data.forEach((change) => {
                const startLine = parseInt(change.lineNumber, 10);
                const endsAfter = parseInt(change.endsAfter, 10) || 1;
                for (let i = 0; i < endsAfter; i++) {
                    const currentLineNumber = startLine + i;
                    const matches = checkIfLineUncoveredInCoverage(currentLineNumber, fileCoverage, typesToCover);
                    if (matches.length) {
                        matches.forEach((match) => filesWithMatches[fileName].push(match));
                    }
                }
            });
            if (filesWithMatches[fileName].length === 0) {
                delete filesWithMatches[fileName];
            }
        });
        resolve(filesWithMatches);
    });
}
