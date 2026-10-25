// Pieces of the auction screen shared by the daily game and private games.
import type { AuctionEvent } from "./game/auction";
import { formatPrice } from "./game/money";
import { formatPoints } from "./game/scoring";
import type { TableEvent } from "./game/table";

/** A small line drawing of a gavel and its block. The head swings down when shown. */
export const GAVEL = `
  <svg class="gavel" viewBox="0 0 64 64" aria-hidden="true">
    <g class="gavel-head">
      <rect x="9" y="24" width="14" height="24" rx="3" />
      <path d="M7 29h18M7 43h18M23 36h34" />
    </g>
    <rect class="gavel-block" x="4" y="51" width="24" height="7" rx="2" />
  </svg>`;

/** Stops text that people typed (like names) from being treated as part of the page. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A bidder's paddle: their initials in a coloured ring. */
export function faceHtml(initials: string, colour: string): string {
  return `<span class="face" style="--c: ${colour}">${escapeHtml(initials)}</span>`;
}

/** One line of the bidding feed. `nameOf` must return HTML-safe names. */
export function eventHtml(
  event: AuctionEvent | TableEvent,
  nameOf: (who: string) => string,
  you: string,
): string {
  const quote = (line?: string) => (line ? ` <q>${line}</q>` : "");
  switch (event.kind) {
    case "open":
      return `Bidding opens at <strong>${formatPrice(event.price)}</strong>.`;
    case "bid":
      return event.who === you
        ? `<b>You</b> bid <strong>${formatPrice(event.amount)}</strong>.`
        : `<b>${nameOf(event.who)}</b> ${event.jump ? "jumps to" : "bids"} <strong>${formatPrice(event.amount)}</strong>.${quote(event.line)}`;
    case "out": {
      const timedOut = "timedOut" in event && event.timedOut;
      if (event.who === you)
        return timedOut
          ? "<b>You</b> ran out of time."
          : "<b>You</b> drop out.";
      return timedOut
        ? `<b>${nameOf(event.who)}</b> ran out of time.`
        : `<b>${nameOf(event.who)}</b> drops out.${quote(event.line)}`;
    }
    case "sold":
      return event.who
        ? `Sold to <b>${nameOf(event.who)}</b> for <strong>${formatPrice(event.price)}</strong>.${quote(event.line)}`
        : "No bids. The lot goes unsold.";
  }
}

/** Your controls when it's your turn: bid the asking price, bid more, or drop out. */
export function yourTurnHtml(ask: number, note = ""): string {
  return `
    <button id="raise" class="btn btn-block">Bid ${formatPrice(ask)}</button>
    <div class="turn-row">
      <form id="custom-form" class="custom-bid" novalidate>
        <span aria-hidden="true">$</span>
        <input id="custom" inputmode="decimal" autocomplete="off" placeholder="Bid more…" aria-label="Bid a different amount" />
        <button class="btn-quiet">Bid</button>
      </form>
      <button id="drop" class="btn-ghost">Drop out</button>
    </div>
    <p class="hint" id="custom-hint">Or jump ahead with your own bid. Shortcuts: 1.5k, 2m, 3b.</p>
    ${note}
    <p class="error" id="error" role="alert"></p>`;
}

/** The hammer falling: who bought it, for how much, and what it was really worth. */
export function soldHtml(sale: {
  /** HTML-safe name of the buyer, or null if nobody bid. */
  buyer: string | null;
  yours: boolean;
  price: number;
  worth: number;
  points: number;
}): string {
  const { buyer, yours, price, worth, points } = sale;
  const percent = Math.round(Math.abs(1 - price / worth) * 100);
  let verdict: string;
  if (yours) {
    verdict =
      points > 0
        ? `A bargain: you paid ${percent}% less than it's worth.`
        : points < 0
          ? `Ouch: you paid ${percent}% more than it's worth.`
          : "You paid about what it's worth. No gain, no loss.";
  } else if (buyer) {
    const outcome =
      points > 0
        ? "got a bargain"
        : points < 0
          ? "overpaid"
          : "paid a fair price";
    verdict = `${buyer} ${outcome} (${formatPoints(points)}). Nothing for you on this one.`;
  } else {
    verdict = "Nobody bid, so no points.";
  }
  return `
    <div class="sold">
      <div>
        <span class="label">${buyer ? `Sold to ${yours ? "you" : buyer} for` : "Unsold"}</span>
        <p class="hammer">${formatPrice(price)}</p>
      </div>
      ${GAVEL}
    </div>
    <div class="worth">
      <p><span class="label">It was really worth</span> <strong>${formatPrice(worth)}</strong></p>
      <p class="verdict">${verdict}${yours ? ` <span class="points ${points < 0 ? "minus" : ""}">${formatPoints(points)}</span>` : ""}</p>
    </div>`;
}

/** Wires up the bid controls from `yourTurnHtml`. */
export function attachTurnControls(
  ask: number,
  onBid: (amount: number) => void,
  onDrop: () => void,
  parse: (text: string) => number | null,
  showError: (text: string) => void,
): void {
  const raise = document.getElementById("raise")!;
  raise.addEventListener("click", () => onBid(ask));
  raise.focus({ preventScroll: true });
  document.getElementById("drop")!.addEventListener("click", onDrop);

  const input = document.getElementById("custom") as HTMLInputElement;
  const hint = document.getElementById("custom-hint")!;
  const defaultHint = hint.textContent;
  input.addEventListener("input", () => {
    const value = parse(input.value);
    hint.textContent =
      input.value.trim() === ""
        ? defaultHint
        : value === null
          ? "That doesn't look like a price."
          : `= ${formatPrice(value)}`;
  });
  document
    .getElementById("custom-form")!
    .addEventListener("submit", (event) => {
      event.preventDefault();
      const value = parse(input.value);
      if (value === null) showError("Type an amount, like 250 or 1.5k.");
      else if (value < ask)
        showError(`The bid must be at least ${formatPrice(ask)}.`);
      else onBid(value);
    });
}
