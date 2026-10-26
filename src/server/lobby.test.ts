import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  MAX_SEATS,
  TURN_SECONDS,
  type LobbyView,
  type ServerMessage,
} from "../multiplayer/protocol";
import { AWAY_TURN_MS, BOT_PAUSE_MS, Lobby, REVEAL_MS } from "./lobby";

/** A fake browser connection that records everything the server sends it. */
function fakeClient() {
  const messages: ServerMessage[] = [];
  return {
    send: (m: ServerMessage) => messages.push(m),
    messages,
    view(): LobbyView {
      const views = messages.filter((m) => m.type === "lobby");
      return views[views.length - 1].lobby;
    },
  };
}

function twoPlayers() {
  const lobby = new Lobby("TEST", undefined, () => 0.42);
  const ana = fakeClient();
  const ben = fakeClient();
  const anaId = lobby.join("Ana", ana.send).id;
  const benId = lobby.join("Ben", ben.send).id;
  return { lobby, ana, ben, anaId, benId };
}

/** Lets bots and turn timers run until it's a person's turn (or the game ends). */
function untilPersonTurn(client: ReturnType<typeof fakeClient>) {
  for (let i = 0; i < 200; i++) {
    const v = client.view();
    if (v.phase !== "playing") return;
    const seat = v.seats.find((s) => s.id === v.lot?.turn);
    if (seat && !seat.isBot) return;
    vi.advanceTimersByTime(v.lot?.sold ? REVEAL_MS : BOT_PAUSE_MS);
  }
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("Lobby", () => {
  it("makes the first person the host and rejects duplicate names", () => {
    const { lobby, ana, anaId } = twoPlayers();
    expect(ana.view().hostId).toBe(anaId);
    expect(() => lobby.join("ana", () => {})).toThrow("already has that name");
  });

  it("needs at least two people, and only the host can start", () => {
    const solo = new Lobby("SOLO");
    const id = solo.join("Ana", () => {}).id;
    expect(() => solo.start(id)).toThrow("at least one friend");
    const { lobby, benId } = twoPlayers();
    expect(() => lobby.start(benId)).toThrow("Only the host");
  });

  it("seats as many rivals as the host chose", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.changeSettings(anaId, { lots: 3, rivals: 4 });
    lobby.start(anaId);
    const seats = ana.view().seats;
    expect(seats).toHaveLength(6);
    expect(seats.filter((s) => s.isBot)).toHaveLength(4);
  });

  it("can play with no rivals at all", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.changeSettings(anaId, { lots: 3, rivals: 0 });
    lobby.start(anaId);
    expect(ana.view().seats.every((s) => !s.isBot)).toBe(true);
  });

  it("only lets the host change settings, and only to allowed values", () => {
    const { lobby, anaId, benId } = twoPlayers();
    expect(() => lobby.changeSettings(benId, { lots: 3, rivals: 1 })).toThrow(
      "Only the host",
    );
    expect(() => lobby.changeSettings(anaId, { lots: 7, rivals: 1 })).toThrow(
      "lot options",
    );
    expect(() => lobby.changeSettings(anaId, { lots: 5, rivals: 6 })).toThrow(
      "up to 5 rivals",
    );
  });

  it("seats up to eight people, with fewer rival seats as it fills", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.changeSettings(anaId, { lots: 5, rivals: 5 });
    for (let i = 3; i <= MAX_SEATS; i++) lobby.join(`Player ${i}`, () => {});
    expect(ana.view().settings.rivals).toBe(0);
    expect(() => lobby.join("One too many", () => {})).toThrow("full");
  });

  it("keeps the real price secret until the lot is sold", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.start(anaId);
    const unsold = ana.messages.flatMap((m) =>
      m.type === "lobby" && m.lobby.lot && !m.lobby.lot.sold
        ? [m.lobby.lot]
        : [],
    );
    expect(unsold.length).toBeGreaterThan(0);
    for (const lot of unsold) {
      expect(JSON.stringify(lot)).not.toMatch(/worth|limits/);
    }
  });

  it("bids the asking price for someone who runs out of time", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.start(anaId);
    untilPersonTurn(ana);
    const { turn, ask } = ana.view().lot!;
    vi.advanceTimersByTime(TURN_SECONDS * 1000);
    const bid = ana
      .view()
      .lot!.events.find((e) => e.kind === "bid" && e.who === turn);
    expect(bid).toMatchObject({ amount: ask, auto: true });
    expect(ana.view().lot!.out).not.toContain(turn);
  });

  it("drops someone after two automatic bids in a row, so absent players can't bid forever", () => {
    const { lobby, ana, anaId, benId } = twoPlayers();
    lobby.changeSettings(anaId, { lots: 3, rivals: 0 });
    lobby.start(anaId);
    // Nobody touches anything: the lot must still end.
    for (let i = 0; i < 10 && !ana.view().lot!.sold; i++)
      vi.advanceTimersByTime(TURN_SECONDS * 1000);
    const lot = ana.view().lot!;
    expect(lot.sold).not.toBeNull();
    for (const who of [anaId, benId]) {
      const autoBids = lot.events.filter(
        (e) => e.kind === "bid" && e.who === who && e.auto,
      ).length;
      expect(autoBids).toBeLessThanOrEqual(2);
    }
    expect(lot.events.some((e) => e.kind === "out" && e.timedOut)).toBe(true);
  });

  it("starts counting again after someone bids for themselves", () => {
    const { lobby, ana, anaId, benId } = twoPlayers();
    lobby.changeSettings(anaId, { lots: 3, rivals: 0 });
    lobby.start(anaId);
    // Ana times out twice, but bids herself in between, so she isn't dropped.
    const turnOf = () => ana.view().lot!.turn;
    vi.advanceTimersByTime(TURN_SECONDS * 1000); // first player times out
    if (turnOf() === benId) lobby.move(benId, { bid: ana.view().lot!.ask });
    vi.advanceTimersByTime(TURN_SECONDS * 1000);
    if (turnOf() === benId) lobby.move(benId, { bid: ana.view().lot!.ask });
    expect(ana.view().lot!.out).not.toContain(anaId);
  });

  it("only lets the person whose turn it is bid", () => {
    const { lobby, ana, anaId, benId } = twoPlayers();
    lobby.start(anaId);
    untilPersonTurn(ana);
    const turn = ana.view().lot!.turn!;
    const other = turn === anaId ? benId : anaId;
    expect(() => lobby.move(other, "drop")).toThrow("isn't your turn");
    expect(() => lobby.move(turn, { bid: 0.001 })).toThrow(
      "below the asking price",
    );
  });

  it("plays all five lots through to the results", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.start(anaId);
    for (let i = 0; i < 500 && ana.view().phase === "playing"; i++) {
      untilPersonTurn(ana);
      const v = ana.view();
      if (v.phase !== "playing") break;
      lobby.move(v.lot!.turn!, "drop");
    }
    const end = ana.view();
    expect(end.phase).toBe("finished");
    expect(end.results).toHaveLength(end.settings.lots);
    expect(end.standings).toHaveLength(end.seats.length);
  });

  it("lets someone back in with their secret after a refresh", () => {
    const { lobby, ana, anaId } = twoPlayers();
    const secret = (
      ana.messages.find((m) => m.type === "joined") as { secret: string }
    ).secret;
    lobby.leave(anaId);
    const again = fakeClient();
    expect(lobby.rejoin(anaId, "wrong", again.send)).toBe(false);
    expect(lobby.rejoin(anaId, secret, again.send)).toBe(true);
    expect(again.view().people.find((p) => p.id === anaId)?.connected).toBe(
      true,
    );
  });

  it("shortens the turn of someone who has left", () => {
    const { lobby, ana, ben, anaId, benId } = twoPlayers();
    lobby.start(anaId);
    untilPersonTurn(ana);
    const turn = ana.view().lot!.turn!;
    lobby.leave(turn);
    const watcher = turn === anaId ? ben : ana;
    vi.advanceTimersByTime(AWAY_TURN_MS);
    expect(
      watcher
        .view()
        .lot!.events.some((e) => e.kind === "out" && e.who === turn),
    ).toBe(true);
    expect([anaId, benId]).toContain(turn);
  });

  it("doesn't repeat lots when the same table plays again", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.changeSettings(anaId, { lots: 10, rivals: 0 });
    const seen = new Set<string>();
    for (let game = 0; game < 5; game++) {
      lobby.start(anaId);
      for (let i = 0; i < 2000 && ana.view().phase === "playing"; i++) {
        const v = ana.view();
        if (v.lot?.sold) vi.advanceTimersByTime(REVEAL_MS);
        else lobby.move(v.lot!.turn!, "drop");
      }
      for (const r of ana.view().results) {
        expect(seen.has(r.name)).toBe(false);
        seen.add(r.name);
      }
    }
    expect(seen.size).toBe(50);
  });

  it("won't let anyone join once the game has started", () => {
    const { lobby, anaId } = twoPlayers();
    lobby.start(anaId);
    expect(() => lobby.join("Cat", () => {})).toThrow("already started");
  });
});
