"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.parse = parse;
/**
 * Inline LCOV parser (same API as lcov-parse) so the action bundle has no
 * external lcov-parse dependency that ncc might leave as require('lcov-parse').
 */
const node_fs_1 = __importDefault(require("node:fs"));
function walkFile(str, cb) {
    const data = [];
    let item = {
        lines: { found: 0, hit: 0, details: [] },
        functions: { found: 0, hit: 0, details: [] },
        branches: { found: 0, hit: 0, details: [] },
        file: '',
    };
    ['end_of_record'].concat(str.split('\n')).forEach((line) => {
        line = line.trim();
        const allparts = line.split(':');
        const parts = [allparts.shift(), allparts.join(':')];
        let lines;
        let fn;
        switch (parts[0].toUpperCase()) {
            case 'TN':
                item = { ...item, file: item.file || '' };
                break;
            case 'SF':
                item.file = parts[1].trim();
                break;
            case 'FNF':
                item.functions.found = Number(parts[1].trim());
                break;
            case 'FNH':
                item.functions.hit = Number(parts[1].trim());
                break;
            case 'LF':
                item.lines.found = Number(parts[1].trim());
                break;
            case 'LH':
                item.lines.hit = Number(parts[1].trim());
                break;
            case 'DA':
                lines = parts[1].split(',');
                item.lines.details.push({
                    line: Number(lines[0]),
                    hit: Number(lines[1]),
                });
                break;
            case 'FN':
                fn = parts[1].split(',');
                item.functions.details.push({
                    name: fn[1],
                    line: Number(fn[0]),
                });
                break;
            case 'FNDA':
                fn = parts[1].split(',');
                item.functions.details.some((i, k) => {
                    if (i.name === fn[1] && i.hit === undefined) {
                        item.functions.details[k].hit = Number(fn[0]);
                        return true;
                    }
                    return false;
                });
                break;
            case 'BRDA':
                fn = parts[1].split(',');
                item.branches.details.push({
                    line: Number(fn[0]),
                    block: Number(fn[1]),
                    branch: Number(fn[2]),
                    taken: fn[3] === '-' ? 0 : Number(fn[3]),
                });
                break;
            case 'BRF':
                item.branches.found = Number(parts[1]);
                break;
            case 'BRH':
                item.branches.hit = Number(parts[1]);
                break;
            default:
                break;
        }
        if (line.indexOf('end_of_record') > -1) {
            data.push({ ...item });
            item = {
                lines: { found: 0, hit: 0, details: [] },
                functions: { found: 0, hit: 0, details: [] },
                branches: { found: 0, hit: 0, details: [] },
                file: '',
            };
        }
    });
    data.shift();
    if (data.length) {
        cb(null, data);
    }
    else {
        cb(new Error('Failed to parse string'), []);
    }
}
/**
 * Parse LCOV from a file path or raw content string.
 * Callback API matching lcov-parse for drop-in replacement.
 */
function parse(file, cb) {
    node_fs_1.default.readFile(file, 'utf8', (err, str) => {
        if (err) {
            if (err.code === 'ENOENT') {
                return walkFile(file, cb);
            }
            cb(err, []);
            return;
        }
        walkFile(str, cb);
    });
}
