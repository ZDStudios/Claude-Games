```
▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄▄
█                                       █
█   ░▒▓  Z D S T U D I O S  ▓▒░        █
█            G A M E S                  █
█                                       █
▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀▀
```

*A growing collection of browser games — no installs, no accounts, just play.*

[![Play Now](https://img.shields.io/badge/play-now-blue?style=flat-square)](https://zdstudios.github.io/Claude-Games/)
[![Made with ♥](https://img.shields.io/badge/made%20with-♥-red?style=flat-square)](#)

---

## 🕹️ Game Library

[**▶ BROWSE THE LIBRARY**](https://zdstudios.github.io/Claude-Games/)

The library page scans this repo live and lists every game as soon as it's pushed to `main` — no manual list to maintain here.

---

## 🤖 For AI agents

[`manifest.json`](https://games.zdstudios.network/manifest.json) is the machine-readable catalogue of the whole library: every game with its description, play modes, credits, tech and code details, and a link to its source file. A short guide is in [`llms.txt`](https://games.zdstudios.network/llms.txt).

The home page points to the manifest (a `<link rel="alternate">`, a meta tag, JSON-LD and a hidden note), and the server redirects known AI crawlers that open the home page straight to it (add `?human` to see the normal page).

After adding, removing or updating a game, regenerate it with `node tools/build-manifest.js` (or `npm run manifest`) and commit `manifest.json`.

---

## 🚀 About

All games are built with vanilla HTML, CSS, and JavaScript (plus the occasional physics engine) — nothing to install, nothing to sign up for. Just click and play directly in your browser.

Built by **[ZDStudios](https://github.com/ZDStudios)** 🎮

---

*Have a suggestion? Open an [issue](https://github.com/ZDStudios/Claude-Games/issues) or drop a star ⭐ if you enjoy the games!*
