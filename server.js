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

app.use(express.static(__dirname, { dotfiles: 'ignore', index: 'index.html' }));

app.listen(PORT, () => {
  console.log(`Claude-Games listening on port ${PORT}`);
});
