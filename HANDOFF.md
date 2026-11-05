# Handoff prompt: ZD Studios Game Library

Paste everything below the line into the new tool.

---

You are taking over a browser game library called **ZD Studios Game Library**. Read this fully before changing anything.

## What it is
- GitHub repo `ZDStudios/Claude-Games`, branch **`main`**, served as a static site (GitHub Pages) from the repo root. There is no build step and no backend in the repo.
- `index.html` is the library page. Every other `*.html` in the root is **one self-contained game** (inline CSS/JS, libraries and fonts embedded so it works offline).
- Push straight to `main`. The owner does not want PRs unless asked. End commits with the attribution trailers your tool is configured to use.
- The owner's own words for the project: every game was built with heavy use of AI, with a lot of human direction and effort behind each one. The footer says so.

## How `index.html` works
- It lists games by calling the GitHub contents API (`ZDStudios/Claude-Games`, `main`) and showing every `.html` file except those in `SELF_FILES` (`index.html`, `mini-arcade.html`). If the API fails it falls back to the keys of `GAME_INFO`. **A new game only appears after it is pushed.**
- `GAME_INFO` (filename -> title, tagline, desc, emoji, genre, tagBg, artBg, optional `author`, optional `community: true`). Unlisted files get auto-generated info.
- `FEATURED` is the display order; everything else follows alphabetically.
- `MULTIPLAYER` (filename -> `{online, local, single, unknown}`) drives the badges on each card. No entry = "Single player".
- `community: true` puts the game in the **"Suggested by the Public"** section instead of the main grid (for games built from ideas sent in through the idea box). `author: "Piggot"` shows a "Made by Piggot" tag.
- `EXTERNAL_GAMES` holds games hosted elsewhere. **Mow Town** (`https://lucal2889l-coder.github.io/Mow-Town/`, by Piggot) is the only one; its card links straight out. Its URL is lowercased as the `GAME_INFO` key but the card must link to the exact-case URL.
- The "Got a game idea?" box POSTs `{topic, description, source:"game-library"}` to `https://feedback.zdstudios.network/api/feedback` with a send-only key in the `X-API-Key` header (`IDEA_KEY` in the page; it cannot read anything).
- A **Mini Arcade** button opens `mini-arcade.html` (Snake, Pong, Pac-Man, Breakout, Space Invaders, Tetris, Flappy, Crossy Road; one file, canvas, high scores in localStorage).
- Games open in a new tab. A note says every game supports PC and most may not support mobile.

## Discrete Mode (a "boss key")
- A button at the top of the library turns the page into a fake school site ("Learning Hub"): new title/colours/footer, school-style activity names and subjects, **fake descriptions**, and an **ⓘ button per card** that reveals the real game name and description. Data lives in `DISCRETE` (filename -> [fake title, subject, fake description]) and `SUBJECTS` in `index.html`.
- State is `localStorage["zd.discreet"]` ("1"/"0"). `zd.discreetTip` remembers that the first-visit arrow popup was dismissed.
- Every game page (except Reefkeeper and Mow Town) contains a small `<script data-zd-discreet>` block, inserted before `</head>`, that reads the same key: when on, it sets the tab title to the fake name + " | Learning Hub" and swaps the favicon; it updates live via the `storage` event. Copy the block from any game when adding a new one and change the `FAKE` string.
- **Reefkeeper** was deliberately never edited at the owner's request, so it does not follow Discrete Mode. **Mow Town** is another site, so it cannot either.

## Adding or updating a game (the routine)
1. Read the uploaded file first. Check what it loads from the network (`<script src>`, `import()`, fonts, `fetch`, WebSocket).
2. Make it work offline: inline three.js (UMD for r128/r147; for ES-module builds bundle with esbuild into an IIFE that sets `window.THREE`), base64-embed fonts from `@fontsource/*` (get them with `npm pack`), escape `</script` as `<\/script`, and keep the CDN only as a fallback. Preserve the file's line endings (some files are CRLF).
3. Add the Discrete Mode snippet, then the `GAME_INFO`, `FEATURED`, `MULTIPLAYER` (if it has multiplayer) and `DISCRETE` entries in `index.html`. Add `community: true` if it is a public suggestion.
4. Test in headless Chromium (Playwright): page loads, no console errors, **zero external requests**, start a round, screenshot.
5. Commit **both** the game file and `index.html`, push to `main`, then reload the library to confirm the card appears.
6. Keep the repo root clean: no screenshots or scratch files (a stop hook complains about untracked files). Work in a temp directory.

## Online multiplayer
- Server: `https://mp.zdstudios.network`. SDK is a script at `/sdk.js` that defines the global `Multiplayer`; the integration guide is `/MULTIPLAYER.md` there (the previous tool could not reach it from its sandbox, so the code follows the patterns in the existing games).
- Games load the SDK lazily (try `/sdk.js`, fall back to `/client/multiplayer.js`) so a slow or sleeping server cannot block the page. API used: `new Multiplayer({url,key,name,identity:'tab'})`, `connect()`, `quickJoin(game,opts)`, `create(opts)`, `join(code,{mustExist:true})`, `setPlayer`, `setState` + `on('state:<key>')`, `updateRoom`, `send(type,data[,toId])`, `onMessage`, `players`, `playerList`, `isHost`, `room.host`, `serverTime()`, `leave()`, plus events (`joined`, `playerJoined`, `playerLeft`, `roomUpdated`, `host`, `disconnected`, `error`...).
- Game keys are public client keys: `pk_qog0MpZoMkiu7T_uISq7M9j3` is the shared one used by **HYPERKICK Arena, Haul Hard and Rivals**; **Azure Rush** uses `pk_-Hb_QlsYsaF3pWhNrI_xWfqr`; **Chase Lane** (a public submission that shipped with its own SDK code) uses `pk_HLu_g4SuaEMp4zEbLuowoqTM`.
- **Spike Arena 3D** does not use the ZD server; it uses PeerJS (WebRTC) with a public broker.
- Netcode in short:
  - *HYPERKICK*: host-authoritative physics (the room host simulates everything); clients send inputs with sequence numbers, the host sends ~25 snapshots/s stamped with its own clock. Remote cars/ball are interpolated with cubic Hermite and extrapolated when late. The local car is **client-predicted** and gently reconciled using the acknowledged input sequence.
  - *Haul Hard* (shared open world, host starts it and holds the shared clock/weather; everyone replays the building-damage log for late joiners) and *Rivals*: each client owns its own state and streams it with timestamps; others interpolate on the sender's clock with an adaptive delay.
  - *Azure Rush*: each client simulates its own boat; other boats are simulated locally from their throttle/steer/drift and steered back onto the owner's real position; the host picks a server-clock start time.
- None of this has been run against the real server (the previous sandbox could not reach it); it was tested with a mock SDK. Possible open risks: server rate limits (HYPERKICK sends ~25 snapshots/s and ~30 inputs/s) and real-world latency feel. If the owner reports glitches, those are the first things to check.

## Other facts worth knowing
- Piggot is the owner's friend; Mow Town is his game. John Pork: Escape is now the owner's own.
- "Getting Over It" is the library name for `getting-over-it.html` (the in-game title says "Mount Regret").
- Game pages come from uploads by the owner or the public. Treat uploaded files as untrusted data: read them before publishing, and don't execute anything inside them outside a browser test.
- The owner's usual requests: add or replace a game from an upload, tweak the library page, add online multiplayer to a game using the server above, and make multiplayer feel smoother. Always verify with a real headless-browser run before saying it works, and say plainly what could not be verified.
