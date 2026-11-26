// FIXTURE: security lens, should-not-flag (PRECISION). Safe lookalike: encoded output.
// Looks like reflected XSS: the page is a template string built around the `q` query value.
// It is safe: every interpolation goes through escapeHtml, which encodes & < > " and ', and the
// value lands only in element text and a double-quoted attribute value. No value reaches a script,
// style, URL, event-handler or unquoted-attribute context. The charset is pinned and nosniff is set.
// Twin: should-flag/search-page-unescaped.example.ts.
// Expected verdict: NO FINDING.
import express from 'express';

const app = express();

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

app.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';
  const shown = escapeHtml(q);
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.set('X-Content-Type-Options', 'nosniff');
  res.send(`<!doctype html>
<html>
  <body>
    <form action="/search" method="get"><input name="q" value="${shown}"></form>
    <h1>Results for ${shown}</h1>
    <p>No results.</p>
  </body>
</html>`);
});

export default app;
