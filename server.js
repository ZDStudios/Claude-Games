'use strict';

/*
 * Claude-Games — static server.
 *
 * Serves every .html game in this repo as-is, plus a tiny /api/games
 * endpoint that lists them. index.html used to discover games by calling
 * the GitHub API at runtime (so the page stayed current without a
 * rebuild); now that this is deployed as a real server with the files
 * sitting right next to it, it asks this endpoint instead — same effect,
 * no GitHub API rate limits, and it works offline from GitHub entirely.
 */

const express = require('express');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Never list the launcher pages themselves as games.
const SELF_FILES = new Set(['index.html', 'mini-arcade.html']);

app.get('/api/games', (req, res) => {
  fs.readdir(__dirname, (err, files) => {
    if (err) return res.status(500).json({ error: 'Could not list games.' });
    const names = files
      .filter((f) => /\.html?$/i.test(f))
      .filter((f) => !SELF_FILES.has(f.toLowerCase()));
    res.json({ files: names });
  });
});

/*
 * AI agents. manifest.json is the machine-readable catalogue of the whole library (built by
 * tools/build-manifest.js). Known AI crawlers / assistants that open the home page are sent straight to it
 * instead of the HTML. Add ?human to the URL to see the normal page. Everyone else is unaffected.
 */
const AI_AGENTS = /GPTBot|ChatGPT-User|OAI-SearchBot|ClaudeBot|Claude-User|Claude-SearchBot|Claude-Web|anthropic-ai|PerplexityBot|Perplexity-User|Applebot-Extended|CCBot|cohere-ai|cohere-training-data-crawler|Bytespider|Meta-ExternalAgent|Meta-ExternalFetcher|MistralAI-User|DuckAssistBot|PetalBot-AI/i;

app.get(['/', '/index.html'], (req, res, next) => {
  // tell every client (and any tool that reads headers) where the manifest is
  res.set('Link', '</manifest.json>; rel="alternate"; type="application/json"; title="Game library manifest for AI agents"');
  res.vary('User-Agent');
  if (req.query.human === undefined && AI_AGENTS.test(req.get('user-agent') || '')) {
    res.set('Cache-Control', 'no-store');   // never let a cache hand this redirect to a human
    return res.redirect(302, '/manifest.json');
  }
  next();
});

// The manifest and llms.txt are meant to be read by tools, including ones running in a browser.
app.get(['/manifest.json', '/llms.txt'], (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Cache-Control', 'public, max-age=300');
  next();
});

app.use(express.static(__dirname, { dotfiles: 'ignore', index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`Claude-Games listening on port ${PORT}`);
});
