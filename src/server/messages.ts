import type { ClientMessage } from "../multiplayer/protocol";
import { GameError } from "./lobby";

/** Turns raw text from a browser into a ClientMessage, rejecting anything malformed. */
export function parseClientMessage(text: string): ClientMessage {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new GameError("Bad message.");
  }
  if (typeof data !== "object" || data === null)
    throw new GameError("Bad message.");
  const m = data as Record<string, unknown>;
  switch (m.type) {
    case "create":
      return { type: "create", name: text_(m.name) };
    case "join":
      return { type: "join", code: text_(m.code), name: text_(m.name) };
    case "rejoin":
      return {
        type: "rejoin",
        code: text_(m.code),
        playerId: text_(m.playerId),
        secret: text_(m.secret),
      };
    case "bid":
      if (typeof m.amount !== "number") throw new GameError("Bad message.");
      return { type: "bid", amount: m.amount };
    case "start":
    case "drop":
    case "playAgain":
      return { type: m.type };
  }
  throw new GameError("Bad message.");
}

function text_(value: unknown): string {
  if (typeof value !== "string" || value.length > 100)
    throw new GameError("Bad message.");
  return value;
}
