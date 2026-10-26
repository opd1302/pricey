# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Pricey": a daily single-player **auction** game, like Wordle in rhythm. Every player gets the same 5 lots each day (by their local date) and bids against 3 personality bots (Margaret every day + 2 of the other 4, rotating daily; `roomForDay`) in an open (ascending) auction: on your turn, bid at least the asking price (~10% steps) or drop out; the last bidder standing wins the lot. When the hammer falls the real price is revealed. Scoring (`scoring.ts`, applied the same way to bots): the winner scores what they saved as a share of value (buy at half its value +500); overpaying is penalised gently at first (`500 × over^1.5`: 10% over ≈ −16, 20% ≈ −45) up to −1000; winning within 5% adds a +250 spot-on bonus; anyone who didn't win but whose highest bid was within 10% of the value gets up to +200 "good read" points; both bonuses are ×0.7 when the price/bid was over the value (`OVER_FACTOR`). The user asked for softer small-overpay penalties, a spot-on reward, and points for dropping out at the right time. You're ranked against the bots, who are scored the same way; shareable emoji result. The daily game is single-player and needs no server. Design decisions by the user: open auction, profit scoring + ranking vs bots, no turn timer, fewer bidders rather than more lots (with 5 bots every lot climbed past its value and some bidders never won anything).

Overpaying is what stops "bid absurdly on everything": it wins every lot but scores −5,000 and ranks last. Dropping out of everything scores 0 but ranks ~3.3rd of 4, so playing safe is also punished.

**Private games** (added later, at the user's request): a host creates a lobby with a 4-letter code; up to 8 bidders per table (people + rivals, `MAX_SEATS`); the host picks the number of lots (3/5/8/10) and rivals (0–5, capped by free seats) in the waiting room; random lots each game; a lobby remembers lots it has played so "play again" doesn't repeat them until it has used the whole list. Rules differ from the daily game: strict turns round the table (`src/game/table.ts`), 15-second turn limit; running out of time auto-bids the asking price, but after 2 auto-bids in a row on one lot (or if disconnected, 3s turns) you're dropped, so absent players can't bid each other up forever, host can "play again". User decisions: take turns (not free-for-all), at least 2 people, random lots (not the daily ones), 15s turns with auto-bid on timeout. The daily game has no timer.

Stack: TypeScript; Vite; plain DOM (no framework); Vitest; Prettier. The daily game is fully static: progress and stats live in the player's `localStorage`. Private games need the Node game server in `src/server/` (`ws` WebSockets, run with `tsx`). GitHub Pages can host the static pages but not the server; private games need a host that runs Node (e.g. Render). In production `npm start` serves both the built pages from `dist/` and `/ws`.

## Commands

- `npm run dev` — game server on :3001 + Vite on :5173 (Vite proxies `/ws` to the server). Pages: `/` home, `/play/` daily game, `/private/` private games
- `npm test` — run all tests once; `npx vitest run src/game/daily.test.ts` for one file
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — pages in `dist/`; then `npm start` runs the server and serves them on :3001 (PORT env var)

## Architecture

- Multi-page Vite site. Each page is an HTML file listed in `vite.config.ts` (`rolldownOptions.input`): `index.html` (home), `play/index.html` (daily game), `private/index.html` (private games). New pages: add `name/index.html` and list it. Links between pages are relative (`play/`, `../`) so the site works under a sub-path (e.g. GitHub Pages). The nav/footer markup is duplicated in each HTML file.
- `src/style.css` — one stylesheet for all pages, linked from each HTML `<head>` (not imported from TS — the cross-document view transition opt-in must be present at first render, which JS-injected CSS in dev isn't).
- `src/game/` — pure logic, all unit-tested, no DOM:
  - `items.ts` — 202 lots (name, detail, category, price, fact, optional `from`). Categories: Everyday, Tech, History, Toys, Big builds, Big business, Auctions, Sport, Pop culture, Crime & scandal, Space, Curiosities. The user wants unusual, surprising lots (Prohibition fines, the Death Star, antimatter), not just products. Names must be unique (tested). Prices go from $0.0369 to $852 quadrillion: `parsePrice` accepts k/m/b/t/q, `formatPrice` shows fractions of a cent below $0.10. Prices and facts were written from memory, so they're worth fact-checking.
  - `daily.ts` — puzzle number from the date (#1 = 2026-10-25) and the daily schedule: days are planned in order from day 1, each taking the 5 longest-unseen lots (ties broken by a seeded shuffle) with at most 2 per category; day 1 is pinned (`PINNED_DAYS`) to the lots it launched with. Adding lots never changes past days **as long as each new lot gets `from: <a future puzzle number>`**; editing or removing existing lots does change the schedule, so avoid that on the live site. Day 1 is pinned; the third batch of lots has `from: 3`. With 202 lots, nothing repeats within about 40 days.
  - `bots.ts` — the five rivals (Margaret the Appraiser, Rupert the Collector, Doris the Bargain Hunter, Tobias the Heir, Vic the Showman). Each sets a secret `limit` per lot from the real price × personality bias × seeded noise; some make jump bids; each has dialogue lines.
  - `auction.ts` — one lot's rules engine (mutates a `Lot`): `openLot` (noisy opening price, a couple of bot bids before your first turn), `placeBid`, `dropOut`, `nextBid` (≈+10%, rounded to 2 significant figures). Fully deterministic from (puzzle, lot index, your actions).
  - `day.ts` — `playDay` rebuilds the whole day by replaying your saved actions; `standings`/`yourStanding` rank all six bidders. Rupert's favourite category is picked per day and shown to the player.
  - `random.ts` — seeded RNG (`seededRandom`, `seedFrom`, `normal`, `shuffle`, `pick`).
  - `scoring.ts` (`profitPoints`, `formatPoints`, `ordinal`), `stats.ts` (streaks), `share.ts` (share text: 🟩 won at profit, 🟥 won at loss, ⬜ didn't win), `money.ts` (parse "1.5k", format prices)
- Bot tuning was done with a throwaway simulation (many days × player styles). Current balance (3 rivals): realistic guesser ranks ~2.0/4 and wins ~43% of days; ~15% of lots sell above value; perfect-knowledge player ~1.0/4; drop-everything ~3.3/4; absurd bidder always last. Re-simulate if you change bot limits.
  - `table.ts` — private-game rules: `openTableLot`, `tableMove` (bid/drop by the seat whose turn it is), `botMove`, `tableStandings`. Turn passes round the table skipping the leader; sells when one bidder is left. Shares bot limits/lines (`botBidAmount`, `botLine` in bots.ts) and `nextBid` with the daily engine.
- `src/multiplayer/protocol.ts` — every message between browser and server, and `LobbyView` (what one player may see: never bot limits, and a lot's real price only once sold).
- `src/server/` — `index.ts` (HTTP + WebSocket server, lobby codes, empty lobbies kept 60s so refreshers can rejoin), `lobby.ts` (`Lobby`: waiting room → 5 lots → results; drives bot turns with a 1.2s pause, 30s turn timers, 5s turns for disconnected people, 8s reveal between lots), `messages.ts` (validates untrusted input). Rejoin after refresh uses a per-player secret kept in the tab's `sessionStorage`.
- `src/private.ts` — the private game page; redraws the card only when the lobby view meaningfully changes (keeps typed bids). `src/ui.ts` — HTML pieces shared with `play.ts` (gavel, paddles, feed lines, bid controls, sold panel; `escapeHtml` for player names).
- `src/avatars.ts` — drawn SVG avatars for every bidder (bots have fixed looks; people get one picked from their name) and `roomMoods`: bidding raises a paddle, your turn shows "…", dropping out slumps, the winner of a bargain cheers "Hooray!", and if the winner overpaid the rest of the room boos while they look sheepish. Used in both modes, the home page and results. Rooms are only redrawn when their HTML changes, so animations don't restart.
- Every item has a short `fact` (tested ≤160 chars), shown small under the reveal only after the lot sells (some facts would give the price away). Written from memory, like the prices: worth fact-checking.
- `src/sound.ts` — sound effects and a lounge-jazz music loop, synthesized with the Web Audio API (no audio files): walking bass, swung ride, soft chords, occasional vibes over an 8-bar progression in F. Nothing plays until the first click/keypress (browser rule); music and effects have on/off buttons in the game pages' top bar (`#sound-controls`), remembered in localStorage. Audio suspends while the tab is hidden.
- Opening prices are log-uniform between 4% and 65% of the value (`openingPrice` in auction.ts, shared with private games). Bot balance after the scoring change (Margaret limit 0.86 × estimate): a bold realistic player wins ~58% of days, a cautious one ~37%; drop-everything and absurd bidders still rank near/at the bottom.
- `src/game/crowd.ts` — a **simulated** crowd (1,000 seeded imaginary bidders per lot, with a per-lot lean so some lots get under/overestimated). After each lot sells, the reveal shows a bar chart (log scale) with the crowd's average, the real price and your bid, plus "closer than X% of the crowd". Always labelled "Simulated": there is no real bid data.
- A rolling leaderboard (`#leaderboard`, `leaderboardHtml` in ui.ts) sits above the card while a game is on, in both modes; in the daily game a lot only counts once its hammer has fallen on screen.
- `src/storage.ts` — localStorage: today's actions per lot (`pricey-auction`) and stats, shared by both pages.
- `src/home.ts` — fills in the home page's "Today's catalogue" (lots stay "Sealed" until sold) and the "Meet the room" bot cards.
- `src/play.ts` — the game: renders the lot card (room of paddles, bid board, feed, your controls), plays new auction events one by one with short pauses so bots feel human, saves your action after each turn, records stats the moment the last lot sells. Refreshing mid-lot rebuilds the same auction (no free retry). In dev only, the home footer has a "Reset today's game" button (`import.meta.env.DEV`, stripped from builds).
- Prices ship in the page code, so a player could peek. Accepted: there's no leaderboard, so cheating only spoils their own game.

## Design

Theme: a quiet evening **auction house** (chosen by the user). Deep navy background (flat, no gradients), cream text, one antique-gold accent; Instrument Serif for headings, item names and prices (italic for small accents), Instrument Sans for everything else, small letter-spaced uppercase labels. Thin 1px rules, generous space, centred single column. Wording: items are "lots", bidders are "the room" (monogram paddles in each bot's colour), the reveal says "Sold to … for" with a gavel-strike animation then "It was really worth", the end screen is "Sale closed" with standings. No emoji in the UI (only in the copied share text).

The user wants it calm, readable and hand-made rather than "vibe-coded", and pushed back when an earlier version copied a reference site (Film Link) too closely. Take inspiration from references, never their look wholesale: no cream paper + condensed all-caps poster type + chunky offset-shadow buttons + tilted stickers + headline-left/card-right hero.

Animation uses View Transitions: `.puzzle-card` has `view-transition-name: puzzle-card`, so the home catalogue card morphs into the game's lot card across pages (opt-in `@view-transition { navigation: auto }` is an inline `<style>` in each HTML head: in the built site the external stylesheet sometimes arrived too late and Chrome skipped the transition), and `play.ts` `animate()` does a page-turn between lots. Browsers without support just switch instantly; reduced-motion users get no animation.

## The user

The user isn't yet familiar with some programming terms (e.g. asked what a "stack" is). Explain decisions in plain language, define jargon when you use it, and prefer the simplest approach that works.

## Claude setup in this repo

- `.claude/hooks/check-ts.mjs` runs after every Edit/Write: formats the edited `.ts` file with Prettier and runs `tsc --noEmit`; type errors come back as hook feedback. Fix them before moving on. It is a no-op until `prettier` and `typescript` are installed and `tsconfig.json` exists.
- `.claude/settings.json` holds the shared permission allowlist and hooks; personal overrides go in `.claude/settings.local.json` (gitignored).
