import assert from 'node:assert/strict';

const { micromark } = await import(process.argv[2]);
const { math, mathHtml } = await import(process.argv[3]);

Object.defineProperty(Object.prototype, 'trust', {
  value: true,
  writable: true,
  configurable: true,
});
try {
  const html = micromark(String.raw`$\href{https://example.com}{click}$`, {
    extensions: [math()],
    htmlExtensions: [mathHtml()],
  });
  assert.doesNotMatch(html, /href="https:\/\/example.com"/);
} finally {
  delete Object.prototype.trust;
}
