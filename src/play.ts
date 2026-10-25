import {
  applyAction,
  askingPrice,
  isYourTurn,
  type AuctionEvent,
  type BidderId,
  type Lot,
  type PlayerAction,
} from "./game/auction";
import { BOT_BY_ID } from "./game/bots";
import { itemsForPuzzle, msUntilNextPuzzle, puzzleNumber } from "./game/daily";
import { lotPoints, playDay, standings, yourStanding } from "./game/day";
import { formatPrice, parsePrice } from "./game/money";
import { formatPoints, ordinal } from "./game/scoring";
import { shareText } from "./game/share";
import { currentStreak, recordGame } from "./game/stats";
import { loadActions, loadStats, saveActions, saveStats } from "./storage";
import {
  attachTurnControls,
  eventHtml,
  faceHtml,
  soldHtml,
  yourTurnHtml,
} from "./ui";

const puzzle = puzzleNumber();
const items = itemsForPuzzle(puzzle);
const dateLabel = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

let actions = loadActions(puzzle, items);
let day = playDay(puzzle, items, actions);
let stats = loadStats();
/** Which lot is on screen, or null for the end-of-day results. */
let current: number | null = day.finished ? null : day.lots.length - 1;
/** How many of the current lot's events have been shown so far. */
let shown = 0;
/** True while the bots' bids are being played out on screen. */
let busy = false;

const game = document.getElementById("game")!;
const marks = document.getElementById("marks")!;
document.getElementById("play-title")!.textContent =
  `No. ${puzzle} · ${dateLabel}`;

// ---------- Who's who ----------

function nameOf(who: BidderId): string {
  return who === "you" ? "You" : BOT_BY_ID[who].firstName;
}

function bidderFace(who: BidderId): string {
  return who === "you"
    ? faceHtml("You", "var(--gold)")
    : faceHtml(BOT_BY_ID[who].initials, BOT_BY_ID[who].colour);
}

// ---------- What the screen shows ----------

/** Replays the first `count` events to find out what the room looked like then. */
function viewAt(lot: Lot, count: number) {
  let price: number | null = null;
  let leader: BidderId | null = null;
  const out = new Set<BidderId>();
  let sold: Extract<AuctionEvent, { kind: "sold" }> | null = null;
  for (const event of lot.events.slice(0, count)) {
    if (event.kind === "bid") {
      price = event.amount;
      leader = event.who;
    } else if (event.kind === "out") {
      out.add(event.who);
    } else if (event.kind === "sold") {
      sold = event;
    }
  }
  const latest = lot.events[count - 1];
  const speaking =
    latest && (latest.kind === "bid" || latest.kind === "out")
      ? latest.who
      : null;
  return { price, leader, out, sold, speaking };
}

function render(): void {
  if (current === null) {
    game.className = "puzzle-card results";
    game.innerHTML = resultsHtml();
    attachResultsHandlers();
    updateCountdown();
  } else {
    const lot = day.lots[current];
    game.className = "puzzle-card lot";
    game.innerHTML = `
      <div class="lot-head">
        <span class="lot-no">Lot ${current + 1}<span class="lot-of"> of ${items.length}</span></span>
        <span class="label">${lot.item.category}</span>
      </div>
      <h1 class="item-name">${lot.item.name}</h1>
      <p class="item-detail">${lot.item.detail}</p>
      <div class="room-head">
        <span class="label">In the room</span>
        ${
          lot.room.some((bot) => bot.id === "rupert")
            ? `<span class="collector-note ${lot.item.category === day.favourite ? "is-hunting" : ""}">
                Rupert is collecting <em>${day.favourite}</em> today</span>`
            : ""
        }
      </div>
      <div class="room" id="room"></div>
      <div class="board" id="board"></div>
      <ol class="feed" id="feed" aria-live="polite"></ol>
      <div class="controls" id="controls"></div>`;
    updateLot();
  }
  updateMarks();
}

/** Redraws the parts of the lot that change as bids come in. */
function updateLot(): void {
  if (current === null) return;
  const lot = day.lots[current];
  const view = viewAt(lot, shown);

  const bidders: BidderId[] = [...lot.room.map((bot) => bot.id), "you"];
  document.getElementById("room")!.innerHTML = bidders
    .map((who) => {
      const classes = [
        "bidder",
        view.leader === who ? "leading" : "",
        view.out.has(who) ? "out" : "",
        view.speaking === who ? "speaking" : "",
      ].join(" ");
      return `<div class="${classes}">${bidderFace(who)}<span class="bidder-name">${nameOf(who)}</span></div>`;
    })
    .join("");

  const board = document.getElementById("board")!;
  if (view.sold) {
    board.innerHTML = soldHtml({
      buyer: view.sold.who ? nameOf(view.sold.who) : null,
      yours: view.sold.who === "you",
      price: view.sold.price,
      worth: lot.item.price,
      points: lotPoints(lot),
    });
  } else {
    const label =
      view.leader === null
        ? "Bidding opens at"
        : view.leader === "you"
          ? "Your bid"
          : `${nameOf(view.leader)} holds the bid`;
    board.innerHTML = `
      <span class="label">${label}</span>
      <p class="current">${formatPrice(view.price ?? lot.opening)}</p>`;
  }

  document.getElementById("feed")!.innerHTML = lot.events
    .slice(0, shown)
    .slice(-5)
    .reverse()
    .map(
      (event, i) =>
        `<li class="${i === 0 ? "fresh" : ""}">${eventHtml(event, (who) => nameOf(who as BidderId), "you")}</li>`,
    )
    .join("");

  const controls = document.getElementById("controls")!;
  if (view.sold) {
    const last = current === items.length - 1;
    controls.innerHTML = `<button id="next" class="btn btn-block">${last ? "See the results" : "Next lot"}</button>`;
    document.getElementById("next")!.addEventListener("click", nextLot);
    document.getElementById("next")!.focus({ preventScroll: true });
  } else if (busy || !isYourTurn(lot)) {
    const youreOut = view.out.has("you");
    controls.innerHTML = `<p class="waiting">${youreOut ? "You're out. The room is still bidding…" : "The room is bidding…"}</p>`;
  } else {
    controls.innerHTML = yourTurnHtml(askingPrice(lot));
    attachTurnControls(
      askingPrice(lot),
      (amount) => act({ bid: amount }),
      () => act("drop"),
      parsePrice,
      showError,
    );
  }
  updateMarks();
}

function updateMarks(): void {
  marks.innerHTML = items
    .map((_, i) => {
      const lot = day.lots[i];
      const finished =
        current === null ||
        i < current ||
        (i === current && viewAt(lot, shown).sold);
      if (!lot || !finished)
        return `<span class="mark ${i === current ? "current" : ""}"></span>`;
      if (lot.sold?.who !== "you") return `<span class="mark passed"></span>`;
      return `<span class="mark ${lotPoints(lot) >= 0 ? "profit" : "loss"}"></span>`;
    })
    .join("");
}

// ---------- End of the day ----------

function resultsHtml(): string {
  const table = standings(day.lots);
  const you = yourStanding(day.lots);
  const average = stats.played
    ? Math.round(stats.totalScore / stats.played)
    : 0;
  const stat = (label: string, value: string) =>
    `<div><dt>${label}</dt><dd>${value}</dd></div>`;
  const rows = table
    .map(
      (s, i) => `
      <li class="${s.who === "you" ? "is-you" : ""}" style="--i: ${i}">
        <span class="lot-no">${i + 1}</span>
        ${bidderFace(s.who)}
        <span class="result-main">
          <span class="result-name">${s.who === "you" ? "You" : BOT_BY_ID[s.who].name}</span>
          <span class="result-sub">${s.won} ${s.won === 1 ? "lot" : "lots"} won</span>
        </span>
        <span class="result-points">${formatPoints(s.score)}</span>
      </li>`,
    )
    .join("");
  const lots = day.lots
    .map((lot, i) => {
      const sold = lot.sold!;
      const yours = sold.who === "you";
      const buyer = sold.who
        ? `${nameOf(sold.who)} paid ${formatPrice(sold.price)}`
        : "Unsold";
      return `
        <li style="--i: ${i + table.length}">
          <span class="lot-no">${i + 1}</span>
          <span class="mark ${yours ? (lotPoints(lot) >= 0 ? "profit" : "loss") : "passed"}"></span>
          <span class="result-main">
            <span class="result-name">${lot.item.name}</span>
            <span class="result-sub">${buyer} · worth ${formatPrice(lot.item.price)}</span>
          </span>
          <span class="result-points ${yours ? "" : "muted"}">${yours ? formatPoints(lotPoints(lot)) : "—"}</span>
        </li>`;
    })
    .join("");
  return `
    <div class="results-head">
      <p class="label label-gold">Sale closed · No. ${puzzle}</p>
      <p class="total">${ordinal(you.rank)}</p>
      <p class="total-of">of ${you.of} bidders · ${formatPoints(you.score)} points</p>
    </div>
    <ol class="result-lots">${rows}</ol>
    <p class="label results-sub">Today's lots</p>
    <ol class="result-lots">${lots}</ol>
    <button id="share" class="btn btn-block">Share your result</button>
    <p class="error" id="error" role="alert"></p>
    <dl class="stats">
      ${stat("Played", String(stats.played))}
      ${stat("Average", formatPoints(average))}
      ${stat("Streak", String(currentStreak(stats, puzzle)))}
      ${stat("Best streak", String(stats.bestStreak))}
    </dl>
    <p class="next-sale">Next sale opens in <span id="countdown"></span></p>
    <a class="text-link back-home" href="../">Back to home</a>`;
}

function updateCountdown(): void {
  // If the page is left open past midnight, load the new day's sale.
  if (puzzleNumber() !== puzzle) location.reload();
  const el = document.getElementById("countdown");
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

// ---------- Playing it out ----------

const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, reduceMotion ? 0 : ms));

/** How long to pause before showing an event, so the bots feel like people. */
function pauseBefore(event: AuctionEvent, lot: Lot): number {
  const youreOut = lot.out.includes("you");
  const ms =
    event.kind === "open"
      ? 350
      : event.kind === "sold"
        ? 900
        : event.kind === "out"
          ? 550
          : event.who === "you"
            ? 0
            : event.jump
              ? 1000
              : event.line
                ? 850
                : 600;
  return youreOut ? ms * 0.6 : ms;
}

/** Shows the current lot's new events one by one. */
async function playEvents(): Promise<void> {
  if (current === null) return;
  const lot = day.lots[current];
  busy = true;
  updateLot();
  while (shown < lot.events.length) {
    await sleep(pauseBefore(lot.events[shown], lot));
    shown++;
    updateLot();
  }
  busy = false;
  updateLot();
}

function act(action: PlayerAction): void {
  if (current === null || busy) return;
  const lot = day.lots[current];
  try {
    applyAction(lot, action);
  } catch {
    showError("That bid can't be placed right now.");
    return;
  }
  while (actions.length <= current) actions.push([]);
  actions[current].push(action);
  saveActions(puzzle, items, actions);
  // Record the day's result as soon as the last lot is sold, in case the page closes.
  if (lot.sold && current === items.length - 1) {
    stats = recordGame(stats, puzzle, yourStanding(day.lots).score);
    saveStats(stats);
  }
  void playEvents();
}

function nextLot(): void {
  if (current === null) return;
  const last = current === items.length - 1;
  void animate(() => {
    if (last) {
      current = null;
    } else {
      day = playDay(puzzle, items, actions);
      current = day.lots.length - 1;
      shown = 0;
    }
    render();
  }).then(() => {
    if (!last) void playEvents();
  });
}

/**
 * Page-turn animation between lots, where the browser supports it. The
 * browser runs `update` a moment later, so this waits until it has.
 */
function animate(update: () => void): Promise<void> {
  if (reduceMotion || !("startViewTransition" in document)) {
    update();
    return Promise.resolve();
  }
  const root = document.documentElement;
  root.dataset.transition = "turn";
  const transition = document.startViewTransition(update);
  // If the browser skips the animation, the card is still updated; that's fine.
  transition.ready.catch(() => {});
  transition.finished.finally(() => delete root.dataset.transition);
  return transition.updateCallbackDone;
}

// ---------- Buttons ----------

function attachResultsHandlers(): void {
  document.getElementById("share")!.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const homeUrl = new URL("../", location.href).href;
    const text = shareText(puzzle, day.lots, homeUrl);
    try {
      await navigator.clipboard.writeText(text);
      button.textContent = "Copied! Paste it anywhere";
    } catch {
      showError("Couldn't copy automatically. Here's your result:\n" + text);
    }
  });
}

function showError(text: string): void {
  const el = document.getElementById("error");
  if (el) el.textContent = text;
}

// ---------- Start ----------

if (current !== null) {
  // Coming back to a lot you'd already bid on: show it as it was, no replay.
  const resumed = (actions[current] ?? []).length > 0;
  shown = resumed ? day.lots[current].events.length : 0;
}
render();
if (current !== null) void playEvents();
setInterval(updateCountdown, 1000);
