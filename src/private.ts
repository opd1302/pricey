import { formatPrice, parsePrice } from "./game/money";
import { formatPoints, ordinal } from "./game/scoring";
import {
  LOT_OPTIONS,
  MAX_SEATS,
  MIN_PEOPLE,
  TURN_SECONDS,
  type ClientMessage,
  maxRivals,
  type LobbyView,
  type SeatView,
  type ServerMessage,
} from "./multiplayer/protocol";
import {
  attachTurnControls,
  escapeHtml,
  eventHtml,
  soldHtml,
  yourTurnHtml,
} from "./ui";
import {
  avatarHtml,
  botLook,
  personLook,
  roomMoods,
  type Look,
} from "./avatars";
import type { BotId } from "./game/bots";

// The private game page. The game server runs the auction; this page shows
// whatever the server says and sends your moves back. Your seat is remembered
// for this browser tab, so refreshing puts you straight back in your game.

const SESSION_KEY = "pricey-private";
const NAME_KEY = "pricey-name";

interface Session {
  code: string;
  playerId: string;
  secret: string;
}

const game = document.getElementById("game")!;
const marks = document.getElementById("marks")!;
const title = document.getElementById("play-title")!;

let socket: WebSocket;
let lobby: LobbyView | null = null;
let connected = false;
/** A summary of what's drawn, so the card is only redrawn when something changes (keeps typed text). */
let drawn = "";
let turnDeadline = 0;
let nextLotDeadline = 0;

// ---------- Talking to the server ----------

function connect(): void {
  const protocol = location.protocol === "https:" ? "wss" : "ws";
  socket = new WebSocket(`${protocol}://${location.host}/ws`);
  socket.addEventListener("open", () => {
    connected = true;
    const session = loadSession();
    if (session) send({ type: "rejoin", ...session });
    else render();
  });
  socket.addEventListener("message", (event) =>
    handle(JSON.parse(event.data) as ServerMessage),
  );
  socket.addEventListener("close", () => {
    connected = false;
    drawn = "lost";
    game.className = "puzzle-card lot";
    game.innerHTML = `
      <h1 class="item-name">Lost connection</h1>
      <p class="item-detail">Couldn't reach the game server. If you were in a game, you'll be put back in your seat.</p>
      <button id="retry" class="btn btn-block">Try again</button>`;
    document
      .getElementById("retry")!
      .addEventListener("click", () => location.reload());
  });
}

function send(message: ClientMessage): void {
  if (socket.readyState !== WebSocket.OPEN) {
    showError("Still connecting to the game server. Try again in a moment.");
    return;
  }
  socket.send(JSON.stringify(message));
}

function handle(message: ServerMessage): void {
  switch (message.type) {
    case "joined":
      saveSession({
        code: message.code,
        playerId: message.playerId,
        secret: message.secret,
      });
      history.replaceState(null, "", `?code=${message.code}`);
      break;
    case "lobby":
      lobby = message.lobby;
      turnDeadline = Date.now() + (lobby.lot?.turnMsLeft ?? 0);
      nextLotDeadline = Date.now() + (lobby.nextLotMsLeft ?? 0);
      render();
      break;
    case "error":
      if (message.gone) {
        clearSession();
        lobby = null;
        render();
      }
      showError(message.message);
      break;
  }
}

// ---------- Drawing ----------

function render(): void {
  if (!lobby) {
    title.textContent = "Private game";
    marks.innerHTML = "";
    if (loadSession() && !connected) return;
    draw("join", "lot", joinHtml(), attachJoin);
    return;
  }
  title.textContent = `Private game · ${lobby.code}`;
  const lot = lobby.lot;
  if (lobby.phase === "waiting") {
    const key = JSON.stringify([
      "waiting",
      lobby.people,
      lobby.hostId,
      lobby.settings,
    ]);
    draw(key, "lot", waitingHtml(lobby), attachWaiting);
  } else if (lobby.phase === "playing" && lot) {
    const key = JSON.stringify(["lot", lot.index, lot.events.length, lot.turn]);
    draw(key, "lot", lotHtml(lobby), attachLot);
  } else {
    const key = JSON.stringify([
      "finished",
      lobby.results.length,
      lobby.hostId,
      lobby.people,
    ]);
    draw(key, "results", resultsHtml(lobby), attachResults);
  }
  updateMarks();
  updateTimers();
}

function draw(
  key: string,
  kind: "lot" | "results",
  html: string,
  attach: () => void,
): void {
  if (key === drawn) return;
  drawn = key;
  game.className = `puzzle-card ${kind}`;
  game.innerHTML = html;
  attach();
}

function joinHtml(): string {
  const code = new URLSearchParams(location.search).get("code") ?? "";
  return `
    <h1 class="item-name">Play with friends</h1>
    <p class="item-detail">Bid against your friends on lots picked at random, with up to ${MAX_SEATS}
      at the table. The host chooses how many lots and rivals. You get ${TURN_SECONDS} seconds a turn.</p>
    <hr class="rule" />
    <label class="field">
      <span class="label">Your name</span>
      <input id="name" maxlength="16" autocomplete="nickname" value="${escapeHtml(savedName())}" />
    </label>
    <button id="create" class="btn btn-block">Create a private game</button>
    <p class="or"><span>or join a friend's game</span></p>
    <form id="join-form" class="turn-row">
      <div class="custom-bid">
        <input id="code" maxlength="4" placeholder="Game code" autocomplete="off" value="${escapeHtml(code)}" aria-label="Game code" />
      </div>
      <button class="btn-ghost">Join</button>
    </form>
    <p class="error" id="error" role="alert"></p>`;
}

function waitingHtml(view: LobbyView): string {
  const isHost = view.hostId === view.you;
  const present = view.people.filter((p) => p.connected).length;
  const most = maxRivals(view.people.length);
  const rivals = Math.min(view.settings.rivals, most);
  const open = MAX_SEATS - view.people.length - rivals;
  const host = view.people.find((p) => p.id === view.hostId);
  const plural = (n: number, word: string) =>
    `${n} ${word}${n === 1 ? "" : "s"}`;

  const rows = view.people.map((p) => {
    const tags = [
      p.id === view.hostId ? "Host" : "",
      p.id === view.you ? "You" : "",
      p.connected ? "" : "Reconnecting…",
    ].filter(Boolean);
    return `
      <li class="${p.connected ? "" : "away"}">
        ${avatarHtml(personLook(p.name, p.colour), "idle", { bubble: false })}
        <span class="result-main">
          <span class="result-name">${escapeHtml(p.name)}</span>
          <span class="result-sub">${tags.join(" · ")}</span>
        </span>
      </li>`;
  });
  for (let i = 0; i < rivals; i++) {
    rows.push(`
      <li class="empty-seat">
        <span class="face">?</span>
        <span class="result-main">
          <span class="result-name">A rival</span>
          <span class="result-sub">Picked at random when the game starts</span>
        </span>
      </li>`);
  }

  const options = (values: number[], selected: number) =>
    values
      .map(
        (v) =>
          `<option value="${v}" ${v === selected ? "selected" : ""}>${v}</option>`,
      )
      .join("");
  const settings = isHost
    ? `<div class="settings">
         <label class="field"><span class="label">Lots</span>
           <select id="lots">${options(LOT_OPTIONS, view.settings.lots)}</select></label>
         <label class="field"><span class="label">Rivals</span>
           <select id="rivals">${options(
             Array.from({ length: most + 1 }, (_, i) => i),
             rivals,
           )}</select></label>
       </div>`
    : `<p class="settings-note">${plural(view.settings.lots, "lot")} · ${plural(rivals, "rival")}</p>`;
  const startNote =
    present < MIN_PEOPLE
      ? "Share the code: you need at least one friend to start."
      : `${present + rivals} bidders at the table.`;
  return `
    <div class="lot-head">
      <span class="label">Game code</span>
      <span class="label">${plural(open, "seat")} open</span>
    </div>
    <p class="game-code">${view.code}</p>
    <button id="copy" class="btn-ghost copy-link">Copy invite link</button>
    <hr class="rule" />
    <ol class="seat-list">${rows.join("")}</ol>
    ${settings}
    ${
      isHost
        ? `<button id="start" class="btn btn-block" ${present < MIN_PEOPLE ? "disabled" : ""}>Start the auction</button>
           <p class="hint center">${startNote}</p>`
        : `<p class="waiting">Waiting for ${escapeHtml(host?.name ?? "the host")} to start…</p>`
    }
    <p class="error" id="error" role="alert"></p>
    <button id="leave" class="text-link back-home link-button">Leave this game</button>`;
}

/** What a seat's avatar looks like: the bot's own look, or one picked from a person's name. */
function lookOf(seat: SeatView): Look {
  return seat.isBot
    ? botLook(seat.id as BotId, seat.colour)
    : personLook(seat.name, seat.colour);
}

function lotHtml(view: LobbyView): string {
  const lot = view.lot!;
  const name = (id: string) =>
    id === view.you
      ? "You"
      : escapeHtml(view.seats.find((s) => s.id === id)?.name ?? "?");
  const latest = lot.events[lot.events.length - 1];
  const moods = roomMoods({
    bidders: view.seats.map((seat) => seat.id),
    out: lot.out,
    justBid: latest?.kind === "bid" ? latest.who : null,
    turn: lot.turn,
    sold: lot.sold,
  });

  const room = view.seats
    .map((seat) => {
      const classes = [
        "bidder",
        lot.leader === seat.id && !lot.sold ? "leading" : "",
        lot.out.includes(seat.id) ? "out" : "",
        lot.turn === seat.id ? "turn" : "",
      ].join(" ");
      return `<div class="${classes}">${avatarHtml(lookOf(seat), moods[seat.id])}<span class="bidder-name">${name(seat.id)}</span></div>`;
    })
    .join("");

  let board: string;
  if (lot.sold) {
    board = soldHtml({
      buyer: lot.sold.who ? name(lot.sold.who) : null,
      yours: lot.sold.who === view.you,
      price: lot.sold.price,
      worth: lot.sold.worth,
      points: lot.sold.points,
      fact: lot.sold.fact,
    });
  } else {
    const label =
      lot.leader === null
        ? "Bidding opens at"
        : lot.leader === view.you
          ? "Your bid"
          : `${name(lot.leader)} holds the bid`;
    board = `<span class="label">${label}</span><p class="current">${formatPrice(lot.price ?? lot.opening)}</p>`;
  }

  const feed = lot.events
    .slice(-5)
    .reverse()
    .map(
      (event, i) =>
        `<li class="${i === 0 ? "fresh" : ""}">${eventHtml(event, name, view.you)}</li>`,
    )
    .join("");

  let controls: string;
  const turnSeat = view.seats.find((s) => s.id === lot.turn);
  if (lot.sold) {
    const last = lot.index === view.settings.lots - 1;
    controls = `<p class="waiting">${last ? "Totting up the results…" : `Next lot in <span id="next-timer"></span>`}</p>`;
  } else if (lot.turn === view.you) {
    controls = yourTurnHtml(
      lot.ask,
      `<p class="turn-timer">Your turn · <span id="turn-timer"></span> left</p>`,
    );
  } else if (turnSeat?.isBot) {
    controls = `<p class="waiting">${escapeHtml(turnSeat.name)} is thinking…</p>`;
  } else {
    controls = `<p class="waiting">Waiting for ${name(lot.turn ?? "")}… <span id="turn-timer" class="muted-timer"></span></p>`;
  }

  return `
    <div class="lot-head">
      <span class="lot-no">Lot ${lot.index + 1}<span class="lot-of"> of ${view.settings.lots}</span></span>
      <span class="label">${lot.category}</span>
    </div>
    <h1 class="item-name">${lot.name}</h1>
    <p class="item-detail">${lot.detail}</p>
    <div class="room-head">
      <span class="label">At the table</span>
      ${
        view.favourite
          ? `<span class="collector-note ${lot.category === view.favourite ? "is-hunting" : ""}">
               Rupert is collecting <em>${view.favourite}</em></span>`
          : ""
      }
    </div>
    <div class="room">${room}</div>
    <div class="board">${board}</div>
    <ol class="feed" aria-live="polite">${feed}</ol>
    <div class="controls">${controls}</div>`;
}

function resultsHtml(view: LobbyView): string {
  const seat = (id: string) => view.seats.find((s) => s.id === id)!;
  const you = view.standings.findIndex((s) => s.id === view.you);
  const isHost = view.hostId === view.you;
  const host = view.people.find((p) => p.id === view.hostId);
  const standings = view.standings
    .map((s, i) => {
      const who = seat(s.id);
      return `
        <li class="${s.id === view.you ? "is-you" : ""}" style="--i: ${i}">
          <span class="lot-no">${i + 1}</span>
          ${avatarHtml(lookOf(who), "idle", { bubble: false })}
          <span class="result-main">
            <span class="result-name">${s.id === view.you ? "You" : escapeHtml(who.name)}${who.title ? ` <em class="seat-title">${who.title}</em>` : ""}</span>
            <span class="result-sub">${s.won} ${s.won === 1 ? "lot" : "lots"} won</span>
          </span>
          <span class="result-points">${formatPoints(s.score)}</span>
        </li>`;
    })
    .join("");
  const lots = view.results
    .map((r, i) => {
      const yours = r.buyer === view.you;
      const buyer = r.buyer
        ? yours
          ? "You"
          : escapeHtml(seat(r.buyer).name)
        : null;
      return `
        <li style="--i: ${i + view.standings.length}">
          <span class="lot-no">${i + 1}</span>
          <span class="mark ${yours ? (r.points >= 0 ? "profit" : "loss") : "passed"}"></span>
          <span class="result-main">
            <span class="result-name">${r.name}</span>
            <span class="result-sub">${buyer ? `${buyer} paid ${formatPrice(r.paid)}` : "Unsold"} · worth ${formatPrice(r.worth)}</span>
          </span>
          <span class="result-points ${yours ? "" : "muted"}">${yours ? formatPoints(r.points) : "—"}</span>
        </li>`;
    })
    .join("");
  return `
    <div class="results-head">
      <p class="label label-gold">Sale closed · Game ${view.code}</p>
      <p class="total">${ordinal(you + 1)}</p>
      <p class="total-of">of ${view.standings.length} bidders · ${formatPoints(view.standings[you].score)} points</p>
    </div>
    <ol class="result-lots">${standings}</ol>
    <p class="label results-sub">The lots</p>
    <ol class="result-lots">${lots}</ol>
    ${
      isHost
        ? `<button id="again" class="btn btn-block">Play again, same table</button>`
        : `<p class="waiting">Waiting for ${escapeHtml(host?.name ?? "the host")} to start another game…</p>`
    }
    <p class="error" id="error" role="alert"></p>
    <button id="leave" class="text-link back-home link-button">Leave this game</button>`;
}

function updateMarks(): void {
  if (!lobby || lobby.phase === "waiting") {
    marks.innerHTML = "";
    return;
  }
  const view = lobby;
  marks.innerHTML = Array.from({ length: view.settings.lots }, (_, i) => {
    const result = view.results[i];
    if (!result)
      return `<span class="mark ${i === view.lot?.index ? "current" : ""}"></span>`;
    if (result.buyer !== view.you) return `<span class="mark passed"></span>`;
    return `<span class="mark ${result.points >= 0 ? "profit" : "loss"}"></span>`;
  }).join("");
}

function updateTimers(): void {
  const seconds = (deadline: number) =>
    `${Math.max(0, Math.ceil((deadline - Date.now()) / 1000))}s`;
  const turn = document.getElementById("turn-timer");
  if (turn) {
    turn.textContent = seconds(turnDeadline);
    turn.classList.toggle("urgent", turnDeadline - Date.now() < 10_000);
  }
  const next = document.getElementById("next-timer");
  if (next) next.textContent = seconds(nextLotDeadline);
}

// ---------- Buttons ----------

function attachJoin(): void {
  const nameInput = document.getElementById("name") as HTMLInputElement;
  const codeInput = document.getElementById("code") as HTMLInputElement;
  const name = () => {
    rememberName(nameInput.value.trim());
    return nameInput.value;
  };
  document
    .getElementById("create")!
    .addEventListener("click", () => send({ type: "create", name: name() }));
  document.getElementById("join-form")!.addEventListener("submit", (event) => {
    event.preventDefault();
    if (!codeInput.value.trim())
      showError("Type the game code your friend gave you.");
    else send({ type: "join", code: codeInput.value, name: name() });
  });
  nameInput.focus();
}

function attachWaiting(): void {
  document.getElementById("copy")!.addEventListener("click", async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const link = `${location.origin}${location.pathname}?code=${lobby!.code}`;
    try {
      await navigator.clipboard.writeText(link);
      button.textContent = "Copied! Send it to your friends";
    } catch {
      showError(`Couldn't copy. Share this link: ${link}`);
    }
  });
  document
    .getElementById("start")
    ?.addEventListener("click", () => send({ type: "start" }));
  const lots = document.getElementById("lots") as HTMLSelectElement | null;
  const rivals = document.getElementById("rivals") as HTMLSelectElement | null;
  const changed = () =>
    send({
      type: "settings",
      settings: { lots: Number(lots!.value), rivals: Number(rivals!.value) },
    });
  lots?.addEventListener("change", changed);
  rivals?.addEventListener("change", changed);
  attachLeave();
}

function attachLot(): void {
  const lot = lobby?.lot;
  if (!lot || lot.sold || lot.turn !== lobby?.you) return;
  attachTurnControls(
    lot.ask,
    (amount) => send({ type: "bid", amount }),
    () => send({ type: "drop" }),
    parsePrice,
    showError,
  );
}

function attachResults(): void {
  document
    .getElementById("again")
    ?.addEventListener("click", () => send({ type: "playAgain" }));
  attachLeave();
}

function attachLeave(): void {
  document.getElementById("leave")!.addEventListener("click", () => {
    clearSession();
    socket.close();
    location.href = location.pathname;
  });
}

function showError(text: string): void {
  const el = document.getElementById("error");
  if (el) el.textContent = text;
}

// ---------- Remembering things in this browser ----------

function loadSession(): Session | null {
  try {
    const text = sessionStorage.getItem(SESSION_KEY);
    return text ? (JSON.parse(text) as Session) : null;
  } catch {
    return null;
  }
}

function saveSession(session: Session): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // ignore: refreshing will just take you back to the join screen
  }
}

function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // ignore
  }
}

function savedName(): string {
  try {
    return localStorage.getItem(NAME_KEY) ?? "";
  } catch {
    return "";
  }
}

function rememberName(name: string): void {
  try {
    localStorage.setItem(NAME_KEY, name);
  } catch {
    // ignore
  }
}

// ---------- Start ----------

if (loadSession()) {
  game.className = "puzzle-card lot";
  game.innerHTML = `<p class="waiting">Finding your seat…</p>`;
} else {
  render();
}
connect();
setInterval(updateTimers, 250);
