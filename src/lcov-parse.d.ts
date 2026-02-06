declare module 'lcov-parse' {
  interface LcovDetailEntry {
    line?: number;
    hit?: number;
    taken?: number;
  }

  interface LcovFileEntry {
    file: string;
    lines: { details: LcovDetailEntry[] };
    functions: { details: LcovDetailEntry[] };
    branches: { details: LcovDetailEntry[] };
  }

  function parse(
    path: string,
    callback: (err: Error | null, data: LcovFileEntry[]) => void
  ): void;

  export default parse;
}
