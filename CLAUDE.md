# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

"Pricey": a daily single-player price-guessing game, like Wordle. Every player gets the same 5 items each day (by their local date), guesses each price once, and gets a score out of 5,000 plus a shareable emoji result. Deliberately single-player and serverless — the user decided against multiplayer rooms.

Stack: TypeScript; Vite; plain DOM (no framework); Vitest; Prettier. A static site — there is no server. Progress and stats live in the player's `localStorage`.

## Commands

- `npm run dev` — open http://localhost:5173
- `npm test` — run all tests once; `npx vitest run src/game/daily.test.ts` for one file
- `npm run typecheck` — `tsc --noEmit`
- `npm run build` — static site in `dist/` (deploy anywhere static); `npm run preview` serves it locally

## Architecture

- `src/game/` — pure logic, all unit-tested, no DOM:
  - `items.ts` — the item/price list (the main content; needs to grow a lot before launch)
  - `daily.ts` — puzzle number from the date (#1 = 2026-10-25) and which 5 items that puzzle gets: a seeded shuffle of `ITEMS`, dealt 5/day without repeats. Changing `ITEMS` reshuffles every day, including today — a real launch needs a fixed schedule.
  - `scoring.ts` — ratio (log-scale) scoring, so 2× too high = 2× too low and cheap/expensive items are judged alike; `tierEmoji` for share squares
  - `stats.ts` (streaks), `share.ts` (share text), `money.ts` (parse "1.5k", format prices)
- `src/main.ts` — the page: re-renders the whole screen on each action (guess → reveal → next → … → results), saves progress after every guess, records stats once on the final guess.
- Prices ship in the page code, so a player could peek. Accepted: there's no leaderboard, so cheating only spoils their own game.

## The user

The user isn't yet familiar with some programming terms (e.g. asked what a "stack" is). Explain decisions in plain language, define jargon when you use it, and prefer the simplest approach that works.

## Claude setup in this repo

- `.claude/hooks/check-ts.mjs` runs after every Edit/Write: formats the edited `.ts` file with Prettier and runs `tsc --noEmit`; type errors come back as hook feedback. Fix them before moving on. It is a no-op until `prettier` and `typescript` are installed and `tsconfig.json` exists.
- `.claude/settings.json` holds the shared permission allowlist and hooks; personal overrides go in `.claude/settings.local.json` (gitignored).
