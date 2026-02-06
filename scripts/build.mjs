import * as esbuild from 'esbuild';

const nodeRequireBanner = `import { createRequire } from 'module';
const require = createRequire(import.meta.url);
`;

await esbuild.build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  outfile: 'dist/index.js',
  banner: { js: nodeRequireBanner },
  minify: true,
});

console.log('Built dist/index.js');
