import "./style.css";
import { itemsForPuzzle, msUntilNextPuzzle, puzzleNumber } from "./game/daily";
import type { Item } from "./game/items";
import { describeMiss, formatPrice, parsePrice } from "./game/money";
import { MAX_POINTS, scoreGuess, tierEmoji } from "./game/scoring";
import { shareText, totalScore } from "./game/share";
import {
  EMPTY_STATS,
  currentStreak,
  recordGame,
  type Stats,
} from "./game/stats";

const PROGRESS_KEY = "pricey-progress";
const STATS_KEY = "pricey-stats";

interface Progress {
  puzzle: number;
  itemIds: string[];
  guesses: number[];
}

const app = document.querySelector<HTMLDivElement>("#app")!;
const puzzle = puzzleNumber();
const items = itemsForPuzzle(puzzle);

let guesses = loadGuesses();
let stats = load<Stats>(STATS_KEY, EMPTY_STATS);
/** True right after a guess, while its answer is on screen. */
let revealing = false;

// ---------- Drawing the page ----------

function render(): void {
  let body: string;
  if (revealing) body = revealHtml(guesses.length - 1);
  else if (guesses.length === items.length) body = finishedHtml();
  else body = guessHtml(guesses.length);
  app.innerHTML = headerHtml() + body;
  attachHandlers();
  updateCountdown();
}

function headerHtml(): string {
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const squares = items
    .map((item, i) =>
      i < guesses.length ? tierEmoji(guesses[i], item.price) : "⬜",
    )
    .join("");
  return `
    <header>
      <h1>💰 Pricey</h1>
      <p class="muted">#${puzzle} · ${date}</p>
      <p class="squares">${squares}</p>
    </header>`;
}

function guessHtml(index: number): string {
  const intro =
    index === 0
      ? `<p class="muted">Guess the price of ${items.length} things. The closer you get, the more
           points you score, up to ${MAX_POINTS.toLocaleString()} each. Everyone gets the same
           items, and there are new ones every day.</p>`
      : "";
  return `
    <main class="card stack">
      ${intro}
      <p class="label">Item ${index + 1} of ${items.length}</p>
      ${itemHtml(items[index])}
      <form id="guess-form" class="stack">
        <div class="money-input">$<input id="guess" inputmode="decimal" autocomplete="off"
          placeholder="e.g. 250 or 1.5k"></div>
        <p class="hint" id="preview">Tip: type k, m or b for thousand, million or billion.</p>
        <button>Guess</button>
      </form>
      <p class="error" id="error"></p>
    </main>`;
}

function revealHtml(index: number): string {
  const item = items[index];
  const guess = guesses[index];
  const { points, bullseye } = scoreGuess(guess, item.price);
  const isLast = index === items.length - 1;
  return `
    <main class="card stack">
      <p class="label">Item ${index + 1} of ${items.length}</p>
      ${itemHtml(item)}
      <div class="answer">
        <p class="label">Actual price</p>
        <div class="price">${formatPrice(item.price)}</div>
        <p>You guessed <strong>${formatPrice(guess)}</strong>
          <span class="muted">· ${describeMiss(guess, item.price)}</span></p>
        <p class="points-big">${tierEmoji(guess, item.price)} +${points}
          ${bullseye ? `<span class="bullseye">Bullseye!</span>` : ""}</p>
      </div>
      <button id="next">${isLast ? "See today's score" : "Next item"}</button>
    </main>`;
}

function finishedHtml(): string {
  const score = totalScore(items, guesses);
  const rows = items
    .map((item, i) => {
      const { points } = scoreGuess(guesses[i], item.price);
      return `
        <li>
          <span>${item.emoji} <strong>${item.name}</strong><br>
            <span class="muted">You: ${formatPrice(guesses[i])} · Actual: ${formatPrice(item.price)}</span></span>
          <span class="points ${points === 0 ? "zero" : ""}">${tierEmoji(guesses[i], item.price)} ${points}</span>
        </li>`;
    })
    .join("");
  const average = stats.played
    ? Math.round(stats.totalScore / stats.played)
    : 0;
  const tile = (value: number, label: string) =>
    `<div class="tile"><strong>${value.toLocaleString()}</strong><span>${label}</span></div>`;
  return `
    <main class="card stack">
      <p class="label center">Today's score</p>
      <div class="price">${score.toLocaleString()}
        <span class="muted out-of">/ ${(items.length * MAX_POINTS).toLocaleString()}</span></div>
      <ol class="results">${rows}</ol>
      <button id="share">Share result</button>
      <p class="error" id="error"></p>
      <div class="tiles">
        ${tile(stats.played, "Played")}
        ${tile(average, "Average")}
        ${tile(currentStreak(stats, puzzle), "Streak")}
        ${tile(stats.bestStreak, "Best streak")}
      </div>
      <p class="muted center">Next Pricey in <strong id="countdown"></strong></p>
    </main>`;
}

function itemHtml(item: Item): string {
  return `
    <div class="item">
      <span class="category">${item.category}</span>
      <div class="emoji">${item.emoji}</div>
      <h2>${item.name}</h2>
      <p class="detail">${item.detail}</p>
    </div>`;
}

function updateCountdown(): void {
  // If the page is left open past midnight, load the new day's puzzle.
  if (puzzleNumber() !== puzzle) location.reload();
  const el = document.querySelector("#countdown");
  if (!el) return;
  const totalSeconds = Math.floor(msUntilNextPuzzle() / 1000);
  const parts = [
    totalSeconds / 3600,
    (totalSeconds % 3600) / 60,
    totalSeconds % 60,
  ];
  el.textContent = parts
    .map((n) => String(Math.floor(n)).padStart(2, "0"))
    .join(":");
}

// ---------- Buttons and inputs ----------

function attachHandlers(): void {
  const input = document.querySelector<HTMLInputElement>("#guess");
  if (input) {
    input.focus();
    input.addEventListener("input", () => {
      const value = parsePrice(input.value);
      document.querySelector("#preview")!.textContent =
        input.value.trim() === ""
          ? ""
          : value === null
            ? "That doesn't look like a price."
            : `= ${formatPrice(value)}`;
    });
  }

  document.querySelector("#guess-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    const value = parsePrice(input!.value);
    if (value === null) {
      showError("Type a price first, like 25 or 1.5k.");
      return;
    }
    guesses = [...guesses, value];
    save<Progress>(PROGRESS_KEY, {
      puzzle,
      itemIds: items.map((i) => i.id),
      guesses,
    });
    if (guesses.length === items.length) {
      stats = recordGame(stats, puzzle, totalScore(items, guesses));
      save(STATS_KEY, stats);
    }
    revealing = true;
    render();
  });

  const next = document.querySelector<HTMLButtonElement>("#next");
  next?.focus(); // so pressing Enter moves on
  next?.addEventListener("click", () => {
    revealing = false;
    render();
  });

  document.querySelector("#share")?.addEventListener("click", async () => {
    const text = shareText(
      puzzle,
      items,
      guesses,
      location.origin + location.pathname,
    );
    try {
      await navigator.clipboard.writeText(text);
      document.querySelector("#share")!.textContent =
        "Copied! Paste it anywhere.";
    } catch {
      showError("Couldn't copy automatically. Here's your result:\n" + text);
    }
  });
}

function showError(text: string): void {
  const el = document.querySelector("#error");
  if (el) el.textContent = text;
}

// ---------- Saving in the browser ----------

/** Today's guesses so far, if they were saved for these same items. */
function loadGuesses(): number[] {
  const saved = load<Progress | null>(PROGRESS_KEY, null);
  if (
    saved?.puzzle === puzzle &&
    saved.itemIds.join() === items.map((i) => i.id).join() &&
    saved.guesses.every((g) => typeof g === "number" && g > 0)
  ) {
    return saved.guesses.slice(0, items.length);
  }
  return [];
}

// Browsers can block storage (e.g. some private modes). Then the game still
// works; it just won't remember anything after the page closes.
function load<T>(key: string, fallback: T): T {
  try {
    const text = localStorage.getItem(key);
    return text ? (JSON.parse(text) as T) : fallback;
  } catch {
    return fallback;
  }
}

function save<T>(key: string, value: T): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore
  }
}

render();
setInterval(updateCountdown, 1000);
