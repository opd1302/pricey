import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LobbyView, ServerMessage } from "../multiplayer/protocol";
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

  it("fills the empty seats with rivals", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.start(anaId);
    const seats = ana.view().seats;
    expect(seats).toHaveLength(4);
    expect(seats.filter((s) => s.isBot)).toHaveLength(2);
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

  it("drops a person who doesn't move within the time limit", () => {
    const { lobby, ana, anaId } = twoPlayers();
    lobby.start(anaId);
    untilPersonTurn(ana);
    const who = ana.view().lot!.turn!;
    vi.advanceTimersByTime(30_000);
    const out = ana
      .view()
      .lot!.events.find((e) => e.kind === "out" && e.who === who);
    expect(out).toMatchObject({ timedOut: true });
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
    expect(end.results).toHaveLength(5);
    expect(end.standings).toHaveLength(4);
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

  it("won't let anyone join once the game has started", () => {
    const { lobby, anaId } = twoPlayers();
    lobby.start(anaId);
    expect(() => lobby.join("Cat", () => {})).toThrow("already started");
  });
});
