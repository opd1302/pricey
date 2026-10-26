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
import {
  lotPoints,
  outcomeOn,
  playDay,
  pointsOn,
  standings,
  yourStanding,
} from "./game/day";
import { highestBidOf } from "./game/scoring";
import { formatPrice, parsePrice } from "./game/money";
import { formatPoints, ordinal } from "./game/scoring";
import { shareText } from "./game/share";
import { currentStreak, recordGame } from "./game/stats";
import { loadActions, loadStats, saveActions, saveStats } from "./storage";
import {
  attachTurnControls,
  eventHtml,
  leaderboardHtml,
  soldHtml,
  yourTurnHtml,
} from "./ui";
import { initSound, mountSoundControls, sfx } from "./sound";
import {
  avatarHtml,
  botLook,
  personLook,
  roomMoods,
  type Look,
} from "./avatars";

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

const YOUR_LOOK = personLook("You", "#d9b45f");

function lookOf(who: BidderId): Look {
  return who === "you" ? YOUR_LOOK : botLook(who, BOT_BY_ID[who].colour);
}

/** The room's last HTML, so it's only redrawn when something changes (keeps avatar animations smooth). */
let roomHtml = "";

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
  return { price, leader, out, sold };
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
    roomHtml = ""; // the card is new, so its room is empty
    updateLot();
  }
  updateMarks();
  updateLeaderboard();
}

let shownLeaderboard = "";
let lastScores = new Map<BidderId, number>();

/** The standings so far: lots count once their hammer has fallen on screen. */
function updateLeaderboard(): void {
  const board = document.getElementById("leaderboard")!;
  if (current === null) {
    board.hidden = true;
    return;
  }
  const now = current;
  const revealed = day.lots.filter(
    (lot, i) => i < now || (i === now && viewAt(lot, shown).sold),
  );
  const table = standings(revealed, day.room);
  const html = leaderboardHtml(
    table.map((s) => ({
      name: nameOf(s.who),
      avatar: avatarHtml(lookOf(s.who), "idle", { bubble: false }),
      score: s.score,
      you: s.who === "you",
      changed: lastScores.has(s.who) && lastScores.get(s.who) !== s.score,
    })),
  );
  lastScores = new Map(table.map((s) => [s.who, s.score]));
  board.hidden = false;
  if (html !== shownLeaderboard) {
    shownLeaderboard = html;
    board.innerHTML = html;
  }
}

/** Redraws the parts of the lot that change as bids come in. */
function updateLot(): void {
  if (current === null) return;
  const lot = day.lots[current];
  const view = viewAt(lot, shown);

  const bidders: BidderId[] = [...lot.room.map((bot) => bot.id), "you"];
  const latest = lot.events[shown - 1];
  const moods = roomMoods({
    bidders,
    out: view.out,
    justBid: latest?.kind === "bid" ? latest.who : null,
    turn: null,
    sold: view.sold ? { who: view.sold.who, points: lotPoints(lot) } : null,
  });
  const html = bidders
    .map((who) => {
      const classes = [
        "bidder",
        view.leader === who && !view.sold ? "leading" : "",
        view.out.has(who) ? "out" : "",
      ].join(" ");
      return `<div class="${classes}">${avatarHtml(lookOf(who), moods[who])}<span class="bidder-name">${nameOf(who)}</span></div>`;
    })
    .join("");
  if (html !== roomHtml) {
    roomHtml = html;
    document.getElementById("room")!.innerHTML = html;
  }

  const board = document.getElementById("board")!;
  if (view.sold) {
    board.innerHTML = soldHtml({
      buyer: view.sold.who ? nameOf(view.sold.who) : null,
      yours: view.sold.who === "you",
      price: view.sold.price,
      worth: lot.item.price,
      points: lotPoints(lot),
      yourRead: yourRead(lot),
      fact: lot.item.fact,
      crowd: {
        name: lot.item.name,
        yourBid:
          view.sold.who === "you"
            ? view.sold.price
            : highestBidOf(lot.events, "you"),
      },
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
  updateLeaderboard();
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
      return `<span class="mark ${outcomeOn(lot, "you")}"></span>`;
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
        ${avatarHtml(lookOf(s.who), "idle", { bubble: false })}
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
      const buyer = sold.who
        ? `${nameOf(sold.who)} paid ${formatPrice(sold.price)}`
        : "Unsold";
      return `
        <li style="--i: ${i + table.length}">
          <span class="lot-no">${i + 1}</span>
          <span class="mark ${outcomeOn(lot, "you")}"></span>
          <span class="result-main">
            <span class="result-name">${lot.item.name}</span>
            <span class="result-sub">${buyer} · worth ${formatPrice(lot.item.price)}</span>
          </span>
          <span class="result-points ${pointsOn(lot, "you") ? "" : "muted"}">${pointsOn(lot, "you") ? formatPoints(pointsOn(lot, "you")) : "—"}</span>
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
    soundFor(lot.events[shown - 1], lot);
  }
  busy = false;
  updateLot();
  if (isYourTurn(lot)) sfx.turn();
}

/** Your highest bid on a lot you didn't win, and the good-read points it earned. */
function yourRead(lot: Lot): { bid: number; points: number } | undefined {
  const bid = highestBidOf(lot.events, "you");
  if (bid === null || lot.sold?.who === "you") return undefined;
  return { bid, points: pointsOn(lot, "you") };
}

function soundFor(event: AuctionEvent, lot: Lot): void {
  if (event.kind === "bid") sfx.bid(event.who === "you");
  else if (event.kind === "out") sfx.drop();
  else if (event.kind === "sold") {
    sfx.gavel();
    // The room's reaction, just after the gavel.
    const points = lotPoints(lot);
    if (event.who && points !== 0)
      setTimeout(() => (points > 0 ? sfx.cheer() : sfx.boo()), 450);
  }
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
initSound({ music: true });
mountSoundControls(document.getElementById("sound-controls")!);
render();
if (current !== null) void playEvents();
setInterval(updateCountdown, 1000);
