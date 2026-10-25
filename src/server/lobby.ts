import { randomUUID } from "node:crypto";
import { BOTS } from "../game/bots";
import { ITEMS, type Item } from "../game/items";
import { pick, seededRandom, shuffle } from "../game/random";
import {
  botMove,
  openTableLot,
  seatOf,
  tableAsk,
  tableLotPoints,
  tableMove,
  tableStandings,
  type Seat,
  type TableAction,
  type TableLot,
} from "../game/table";
import {
  LOBBY_SIZE,
  LOTS_PER_GAME,
  MIN_PEOPLE,
  TURN_SECONDS,
  type LobbyView,
  type SeatView,
  type ServerMessage,
} from "../multiplayer/protocol";

/** A mistake by a player (e.g. a bad name). Its message is shown to them. */
export class GameError extends Error {}

export const MAX_NAME_LENGTH = 16;
export const BOT_PAUSE_MS = 1200;
export const REVEAL_MS = 8000;
/** A person who has lost connection gets a much shorter turn. */
export const AWAY_TURN_MS = 5000;
const TURN_MS = TURN_SECONDS * 1000;
const PEOPLE_COLOURS = ["#d9b45f", "#7fc8c2", "#e39a7a", "#a7b6f2"];

interface Person {
  id: string;
  name: string;
  secret: string;
  connected: boolean;
  send: (message: ServerMessage) => void;
}

/**
 * One private game: the waiting room, then five lots played round the table,
 * then the results. Lives only in the server's memory.
 */
export class Lobby {
  private people: Person[] = [];
  private hostId = "";
  private phase: LobbyView["phase"] = "waiting";
  private seats: Seat[] = [];
  private items: Item[] = [];
  private lots: TableLot[] = [];
  private favourite = "";
  private seed = 0;
  private turnEndsAt: number | null = null;
  private nextLotAt: number | null = null;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private nextId = 1;

  constructor(
    readonly code: string,
    private readonly pool: Item[] = ITEMS,
    private readonly random: () => number = Math.random,
  ) {}

  join(rawName: string, send: Person["send"]): Person {
    const name = rawName.trim();
    if (!name) throw new GameError("Please enter a name.");
    if (name.length > MAX_NAME_LENGTH)
      throw new GameError(`Names can be at most ${MAX_NAME_LENGTH} letters.`);
    if (this.phase !== "waiting")
      throw new GameError("This game has already started.");
    if (this.people.length >= LOBBY_SIZE)
      throw new GameError("This game is full.");
    if (this.people.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      throw new GameError("Someone in this game already has that name.");

    const person: Person = {
      id: `p${this.nextId++}`,
      name,
      secret: randomUUID(),
      connected: true,
      send,
    };
    this.people.push(person);
    if (!this.isConnected(this.hostId)) this.hostId = person.id;
    send({
      type: "joined",
      code: this.code,
      playerId: person.id,
      secret: person.secret,
    });
    this.broadcast();
    return person;
  }

  /** Reconnects someone who refreshed the page or lost their connection. */
  rejoin(id: string, secret: string, send: Person["send"]): boolean {
    const person = this.people.find((p) => p.id === id && p.secret === secret);
    if (!person) return false;
    person.connected = true;
    person.send = send;
    if (!this.isConnected(this.hostId)) this.hostId = person.id;
    send({
      type: "joined",
      code: this.code,
      playerId: person.id,
      secret: person.secret,
    });
    this.broadcast();
    return true;
  }

  leave(id: string): void {
    const person = this.people.find((p) => p.id === id);
    if (!person) return;
    person.connected = false;
    if (id === this.hostId)
      this.hostId = this.people.find((p) => p.connected)?.id ?? id;
    // If they were mid-turn, shorten it rather than wait the full 30 seconds.
    const lot = this.currentLot();
    if (this.phase === "playing" && lot?.turn === id && this.turnEndsAt) {
      this.startPersonTurn(
        lot,
        id,
        Math.min(AWAY_TURN_MS, this.turnEndsAt - Date.now()),
      );
    }
    this.broadcast();
  }

  isEmpty(): boolean {
    return !this.people.some((p) => p.connected);
  }

  start(byId: string): void {
    this.requireHost(byId);
    if (this.phase === "playing")
      throw new GameError("The game has already started.");
    const present = this.people.filter((p) => p.connected);
    if (present.length < MIN_PEOPLE)
      throw new GameError("You need at least one friend to start.");
    this.people = present;

    this.seed = Math.floor(this.random() * 2 ** 31);
    const random = seededRandom(this.seed);
    this.items = shuffle(this.pool, random).slice(0, LOTS_PER_GAME);
    const rivals = shuffle(BOTS, random).slice(0, LOBBY_SIZE - present.length);
    this.seats = [
      ...present.map((p) => ({ id: p.id, name: p.name })),
      ...rivals.map((bot) => ({ id: bot.id, name: bot.firstName, bot })),
    ];
    this.favourite = pick(
      this.items.map((i) => i.category),
      random,
    );
    this.lots = [];
    this.phase = "playing";
    this.openNextLot();
  }

  move(byId: string, action: TableAction): void {
    const lot = this.currentLot();
    if (this.phase !== "playing" || !lot || lot.sold)
      throw new GameError("There's nothing to bid on right now.");
    if (lot.turn !== byId) throw new GameError("It isn't your turn.");
    if (action !== "drop") {
      const ask = tableAsk(lot);
      if (!Number.isFinite(action.bid) || action.bid < ask)
        throw new GameError("That bid is below the asking price.");
      if (action.bid > 1e13) throw new GameError("That's not a sensible bid.");
    }
    tableMove(lot, byId, action);
    this.nextTurn();
  }

  /** Stops any pending timer. Call when throwing the lobby away. */
  dispose(): void {
    clearTimeout(this.timer);
  }

  // ---------- Running the game ----------

  private openNextLot(): void {
    const index = this.lots.length;
    this.lots.push(
      openTableLot(
        this.items[index],
        this.seats,
        this.seed,
        index,
        this.favourite,
      ),
    );
    this.nextLotAt = null;
    this.nextTurn();
  }

  /** Works out who moves next and sets the right timer. */
  private nextTurn(): void {
    clearTimeout(this.timer);
    this.turnEndsAt = null;
    const lot = this.currentLot()!;

    if (lot.sold) {
      if (this.lots.length === this.items.length) {
        this.phase = "finished";
      } else {
        this.nextLotAt = Date.now() + REVEAL_MS;
        this.timer = setTimeout(() => this.openNextLot(), REVEAL_MS);
      }
      this.broadcast();
      return;
    }

    const seat = seatOf(lot, lot.turn!)!;
    if (seat.bot) {
      // A short pause so bots feel like people thinking.
      this.timer = setTimeout(() => {
        tableMove(lot, seat.id, botMove(lot));
        this.nextTurn();
      }, BOT_PAUSE_MS);
      this.broadcast();
      return;
    }
    const person = this.people.find((p) => p.id === seat.id);
    this.startPersonTurn(
      lot,
      seat.id,
      person?.connected ? TURN_MS : AWAY_TURN_MS,
    );
    this.broadcast();
  }

  private startPersonTurn(lot: TableLot, id: string, ms: number): void {
    clearTimeout(this.timer);
    this.turnEndsAt = Date.now() + ms;
    this.timer = setTimeout(() => {
      tableMove(lot, id, "drop", true);
      this.nextTurn();
    }, ms);
  }

  // ---------- What players see ----------

  view(forId: string): LobbyView {
    const now = Date.now();
    const lot = this.currentLot();
    const seatViews = this.seats.map((seat, i): SeatView => {
      if (seat.bot) {
        return {
          id: seat.id,
          name: seat.name,
          initials: seat.bot.initials,
          colour: seat.bot.colour,
          isBot: true,
          title: seat.bot.title,
        };
      }
      return {
        id: seat.id,
        name: seat.name,
        initials: initials(seat.name),
        colour: PEOPLE_COLOURS[i],
        isBot: false,
      };
    });
    return {
      code: this.code,
      you: forId,
      hostId: this.hostId,
      people: this.people.map((p, i) => ({
        id: p.id,
        name: p.name,
        initials: initials(p.name),
        colour: PEOPLE_COLOURS[i],
        connected: p.connected,
      })),
      phase: this.phase,
      seats: seatViews,
      favourite: this.seats.some((s) => s.id === "rupert")
        ? this.favourite
        : null,
      lot: lot
        ? {
            index: this.lots.length - 1,
            name: lot.item.name,
            detail: lot.item.detail,
            category: lot.item.category,
            opening: lot.opening,
            price: lot.price,
            leader: lot.leader,
            out: lot.out,
            turn: lot.turn,
            ask: tableAsk(lot),
            turnMsLeft: this.turnEndsAt
              ? Math.max(0, this.turnEndsAt - now)
              : null,
            events: lot.events,
            sold: lot.sold && {
              ...lot.sold,
              worth: lot.item.price,
              points: tableLotPoints(lot),
            },
          }
        : null,
      nextLotMsLeft: this.nextLotAt ? Math.max(0, this.nextLotAt - now) : null,
      results: this.lots
        .filter((l) => l.sold)
        .map((l) => ({
          name: l.item.name,
          buyer: l.sold!.who,
          paid: l.sold!.price,
          worth: l.item.price,
          points: tableLotPoints(l),
        })),
      standings: tableStandings(this.seats, this.lots),
    };
  }

  private currentLot(): TableLot | undefined {
    return this.lots[this.lots.length - 1];
  }

  private requireHost(id: string): void {
    if (id !== this.hostId) throw new GameError("Only the host can do that.");
  }

  private isConnected(id: string): boolean {
    return this.people.some((p) => p.id === id && p.connected);
  }

  private broadcast(): void {
    for (const person of this.people) {
      if (person.connected)
        person.send({ type: "lobby", lobby: this.view(person.id) });
    }
  }
}

/** "Ana" → "AN", "Ben Smith" → "BS". */
function initials(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  const letters =
    words.length > 1 ? words[0][0] + words[1][0] : name.slice(0, 2);
  return letters.toUpperCase();
}
