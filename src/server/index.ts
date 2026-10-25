// The private-game server. Browsers connect to it over a WebSocket (a
// connection that stays open, so the server can push updates instantly).
//
// During development (npm run dev) Vite serves the pages and forwards /ws here.
// In production (npm run build, then npm start) this server also serves the
// built pages from dist/, so the whole site runs as one program.
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { WebSocketServer } from "ws";
import type { ServerMessage } from "../multiplayer/protocol";
import { GameError, Lobby } from "./lobby";
import { parseClientMessage } from "./messages";

const PORT = Number(process.env.PORT) || 3001;
const DIST = resolve("dist");
/** How long an empty game is kept, so people who refresh can get back in. */
const EMPTY_LOBBY_GRACE_MS = 60_000;
// No I or O, so codes can't be confused with 1 and 0.
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const CONTENT_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
};

const lobbies = new Map<string, Lobby>();

const server = createServer(async (req, res) => {
  try {
    let { pathname } = new URL(req.url ?? "/", "http://localhost");
    if (pathname.endsWith("/")) pathname += "index.html";
    const file = resolve(DIST, "." + decodeURIComponent(pathname));
    if (!file.startsWith(DIST + sep)) throw new Error("Outside dist");
    const body = await readFile(file);
    res.writeHead(200, {
      "Content-Type":
        CONTENT_TYPES[extname(file)] ?? "application/octet-stream",
    });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end(
      "Not found. (In development, open the Vite address instead: http://localhost:5173)",
    );
  }
});

const wss = new WebSocketServer({ server, path: "/ws", maxPayload: 2048 });

wss.on("connection", (socket) => {
  let lobby: Lobby | undefined;
  let playerId: string | undefined;
  const send = (message: ServerMessage) => {
    if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(message));
  };

  socket.on("message", (raw) => {
    try {
      const message = parseClientMessage(raw.toString());
      switch (message.type) {
        case "create": {
          if (lobby) throw new GameError("You're already in a game.");
          const created = new Lobby(newCode());
          playerId = created.join(message.name, send).id;
          lobbies.set(created.code, created);
          lobby = created;
          return;
        }
        case "join": {
          if (lobby) throw new GameError("You're already in a game.");
          const found = lobbies.get(message.code.trim().toUpperCase());
          if (!found) throw new GameError("There's no game with that code.");
          playerId = found.join(message.name, send).id;
          lobby = found;
          return;
        }
        case "rejoin": {
          const found = lobbies.get(message.code);
          if (!found?.rejoin(message.playerId, message.secret, send)) {
            send({
              type: "error",
              message: "That game has ended.",
              gone: true,
            });
            return;
          }
          lobby = found;
          playerId = message.playerId;
          return;
        }
      }
      if (!lobby || !playerId) throw new GameError("Join a game first.");
      switch (message.type) {
        case "settings":
          lobby.changeSettings(playerId, message.settings);
          break;
        case "start":
        case "playAgain":
          lobby.start(playerId);
          break;
        case "bid":
          lobby.move(playerId, { bid: message.amount });
          break;
        case "drop":
          lobby.move(playerId, "drop");
          break;
      }
    } catch (error) {
      if (error instanceof GameError) {
        send({ type: "error", message: error.message });
      } else {
        console.error(error);
        send({ type: "error", message: "Something went wrong on the server." });
      }
    }
  });

  socket.on("close", () => {
    if (!lobby || !playerId) return;
    const left = lobby;
    left.leave(playerId);
    if (left.isEmpty()) {
      setTimeout(() => {
        if (left.isEmpty() && lobbies.get(left.code) === left) {
          left.dispose();
          lobbies.delete(left.code);
        }
      }, EMPTY_LOBBY_GRACE_MS);
    }
  });
});

function newCode(): string {
  let code: string;
  do {
    code = Array.from(
      { length: 4 },
      () => CODE_LETTERS[Math.floor(Math.random() * CODE_LETTERS.length)],
    ).join("");
  } while (lobbies.has(code));
  return code;
}

server.listen(PORT, () => {
  console.log(`Private game server listening on http://localhost:${PORT}`);
});
