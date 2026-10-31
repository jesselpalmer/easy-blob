import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { test } from 'node:test';

// Resolve through the actual parent packages, including on a nested npm install.
const require = createRequire(import.meta.url);
const markdown = createRequire(require.resolve('markdownlint'));
const mathPath = markdown.resolve('micromark-extension-math');
const { micromark } = await import(pathToFileURL(markdown.resolve('micromark')).href);
const { math, mathHtml } = await import(pathToFileURL(mathPath).href);
const { lint } = await import(pathToFileURL(markdown.resolve('markdownlint/sync')).href);
const config = JSON.parse(readFileSync(new URL('../../.markdownlint.json', import.meta.url)));

function render(source, options) {
  return micromark(source, { extensions: [math()], htmlExtensions: [mathHtml(options)] });
}

test('Markdown tooling renders inline and block math with patched KaTeX', () => {
  assert.match(render(String.raw`Inline $a^2 + b^2 = c^2$.`), /class="katex"/);
  assert.match(render('$$\n\\frac{1}{2}\n$$\n'), /class="katex-display"/);
  assert.match(render('A literal \\$5 stays text.'), /\$5/);
});

test('explicit trust remains opt-in through the parent math renderer', () => {
  const source = String.raw`$\href{https://example.com}{click}$`;
  assert.doesNotMatch(render(source), /href="https:\/\/example.com"/);
  assert.match(render(source, { trust: true }), /href="https:\/\/example.com"/);
});

test('inherited trust cannot bypass KaTeX defaults (GHSA-238p-pmpm-9mq7)', () => {
  // Pollute only a disposable process. Never modify the test runner's prototype.
  execFileSync(
    process.execPath,
    [
      fileURLToPath(new URL('./fixtures/trust-bypass.mjs', import.meta.url)),
      pathToFileURL(markdown.resolve('micromark')).href,
      pathToFileURL(mathPath).href,
    ],
    {
      cwd: fileURLToPath(new URL('../../', import.meta.url)),
      stdio: 'pipe',
      timeout: 10_000,
    }
  );
});

test('Markdown lint still understands math and enforces prose, links and headings', () => {
  const valid = '# Math\n\nInline $a^2$.\n\n$$\n\\frac{1}{2}\n$$\n';
  assert.deepEqual(lint({ strings: { sample: valid }, config }).sample, []);
  const invalid =
    '# Heading\n\n# Heading\n\n[text][missing]\n\n' +
    'long prose '.repeat(15) +
    '\n\n[unused]: https://example.com\n';
  const codes = lint({ strings: { sample: invalid }, config }).sample.flatMap(
    (error) => error.ruleNames
  );
  for (const rule of ['MD013', 'MD024', 'MD052', 'MD053']) assert(codes.includes(rule), rule);
});

test('affected deepmerge chain and obsolete glob override are absent from the lockfile', () => {
  const lock = JSON.parse(readFileSync(new URL('../../package-lock.json', import.meta.url)));
  for (const filename of Object.keys(lock.packages)) {
    assert(!/(?:^|\/)node_modules\/(?:deepmerge|jest|ts-jest|glob)$/.test(filename), filename);
  }
});
