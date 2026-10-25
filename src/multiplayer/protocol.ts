// The messages the private-game server and players' browsers send each other.
// Shared by both sides so TypeScript catches any mismatch.
import type { TableEvent } from "../game/table";

/** Most bidders at one table, people and rivals together. */
export const MAX_SEATS = 8;
export const MIN_PEOPLE = 2;
/** There are only five rival bots. */
export const MAX_RIVALS = 5;
export const TURN_SECONDS = 10;
export const LOT_OPTIONS = [3, 5, 8, 10];

/** Chosen by the host in the waiting room. */
export interface Settings {
  lots: number;
  rivals: number;
}

export const DEFAULT_SETTINGS: Settings = { lots: 5, rivals: 2 };

/** How many rivals can join, given how many people are in the game. */
export function maxRivals(people: number): number {
  return Math.max(0, Math.min(MAX_RIVALS, MAX_SEATS - people));
}

export interface SeatView {
  id: string;
  name: string;
  initials: string;
  colour: string;
  isBot: boolean;
  /** A bot's title, e.g. "The Appraiser". */
  title?: string;
}

export interface LotView {
  index: number;
  name: string;
  detail: string;
  category: string;
  opening: number;
  price: number | null;
  leader: string | null;
  out: string[];
  turn: string | null;
  ask: number;
  /** How long the current person has left to move, or null on a bot's turn. */
  turnMsLeft: number | null;
  events: TableEvent[];
  /** Only filled in once sold: that's when the real price is revealed. */
  sold: {
    who: string | null;
    price: number;
    worth: number;
    points: number;
    fact: string;
  } | null;
}

export interface ResultView {
  name: string;
  buyer: string | null;
  paid: number;
  worth: number;
  points: number;
}

export interface LobbyView {
  code: string;
  /** Which person this view was made for. */
  you: string;
  hostId: string;
  people: {
    id: string;
    name: string;
    initials: string;
    colour: string;
    connected: boolean;
  }[];
  phase: "waiting" | "playing" | "finished";
  settings: Settings;
  seats: SeatView[];
  /** Rupert's favourite category, if he's at the table. */
  favourite: string | null;
  lot: LotView | null;
  nextLotMsLeft: number | null;
  results: ResultView[];
  standings: { id: string; score: number; won: number }[];
}

export type ClientMessage =
  | { type: "create"; name: string }
  | { type: "join"; code: string; name: string }
  | { type: "rejoin"; code: string; playerId: string; secret: string }
  | { type: "settings"; settings: Settings }
  | { type: "start" }
  | { type: "bid"; amount: number }
  | { type: "drop" }
  | { type: "playAgain" };

export type ServerMessage =
  | { type: "joined"; code: string; playerId: string; secret: string }
  | { type: "lobby"; lobby: LobbyView }
  /** `gone` means the game you tried to rejoin no longer exists. */
  | { type: "error"; message: string; gone?: boolean };
