// FIXTURE: security lens, should-flag (RECALL). Twin of should-not-flag/search-page-escaped.example.ts.
// Planted: the `q` query value is interpolated into the HTML response with no encoding, both in
// element text and in a double-quoted attribute, so /search?q=<script>...</script> (or
// q=" autofocus onfocus=...) runs script on this origin for anyone who opens the link
// -> reflected XSS, CWE-79 (high).
// Expected verdict: FLAG.
import express from 'express';

const app = express();

app.get('/search', (req, res) => {
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 200) : '';
  res.set('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html>
<html>
  <body>
    <form action="/search" method="get"><input name="q" value="${q}"></form>
    <h1>Results for ${q}</h1>
    <p>No results.</p>
  </body>
</html>`);
});

export default app;
