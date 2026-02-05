const pluralToSingularMap = {
    functions: 'function',
    branches: 'branch',
    lines: 'line',
};
const GITHUB_WORKSPACE = process.env.GITHUB_WORKSPACE ?? '';
function summarizeAnnotations(data) {
    const formattedData = {};
    Object.entries(data).forEach(([filename, annotations]) => {
        const annotationMap = new Map();
        annotations.forEach((annotation) => {
            const { lineNumber, annotationType } = annotation;
            const existing = annotationMap.get(annotationType) ?? [];
            existing.push(lineNumber);
            annotationMap.set(annotationType, existing);
        });
        const formattedAnnotations = {};
        annotationMap.forEach((lineNumbers, annotationType) => {
            formattedAnnotations[annotationType] = lineNumbers;
        });
        formattedData[filename] = formattedAnnotations;
    });
    return formattedData;
}
export function createAnnotations(uncoveredData, coverageType) {
    const annotations = [];
    if (coverageType === 'summarize') {
        const summarizedData = summarizeAnnotations(uncoveredData);
        console.log('summarizedData', summarizedData);
        for (const file of Object.keys(summarizedData)) {
            let message = '';
            Object.entries(summarizedData[file]).forEach(([annotationType, linesArray]) => {
                message += `The ${annotationType} at place(s) ${linesArray.join(', ')} were not covered by any of the Tests.\n`;
            });
            console.log('message', message);
            const filePathTrimmed = file.replace(`${GITHUB_WORKSPACE}/`, '');
            annotations.push({
                path: filePathTrimmed,
                start_line: 1,
                end_line: 1,
                annotation_level: 'failure',
                title: '** Summary of Uncovered Code **',
                message,
            });
        }
    }
    else if (coverageType === 'detailed') {
        for (const file of Object.keys(uncoveredData)) {
            const items = uncoveredData[file];
            if (Array.isArray(items)) {
                items.forEach((annotation) => {
                    const filePathTrimmed = file.replace(`${GITHUB_WORKSPACE}/`, '');
                    annotations.push({
                        path: filePathTrimmed,
                        start_line: annotation.lineNumber,
                        end_line: annotation.lineNumber,
                        annotation_level: 'failure',
                        message: `${pluralToSingularMap[annotation.annotationType] ?? annotation.annotationType} not covered!`,
                    });
                });
            }
        }
    }
    return annotations;
}
//# sourceMappingURL=annotations.js.map