// Test entry point for `npm test` (= `node --test scripts/test/`).
//
// Node 22 treats a directory passed to `node --test` as a module to run, so it loads this
// index.js. We simply import every *.test.mjs file next to it; node:test collects their tests
// and a failing test still makes `npm test` exit with code 1.
//
// (If package.json ever switches to `node --test "scripts/test/*.test.mjs"`, this file is
// no longer needed — it does no harm either, because that pattern does not match it.)
import { readdirSync } from 'node:fs';

const dir = new URL('./', import.meta.url);
const testFiles = readdirSync(dir).filter((f) => f.endsWith('.test.mjs')).sort();
for (const file of testFiles) {
  await import(new URL(file, dir));
}
