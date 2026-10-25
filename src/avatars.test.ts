import { describe, expect, it } from "vitest";
import { avatarHtml, personLook, roomMoods } from "./avatars";

const bidders = ["you", "margaret", "vic"];

describe("roomMoods", () => {
  it("raises the paddle of whoever just bid and slumps those who dropped out", () => {
    const moods = roomMoods({
      bidders,
      out: ["vic"],
      justBid: "margaret",
      turn: null,
      sold: null,
    });
    expect(moods).toEqual({ you: "idle", margaret: "bid", vic: "out" });
  });

  it("shows who is thinking on their turn", () => {
    expect(
      roomMoods({ bidders, out: [], justBid: null, turn: "you", sold: null })
        .you,
    ).toBe("thinking");
  });

  it("has the winner cheer a bargain", () => {
    const moods = roomMoods({
      bidders,
      out: [],
      justBid: null,
      turn: null,
      sold: { who: "vic", points: 300 },
    });
    expect(moods).toEqual({ you: "idle", margaret: "idle", vic: "cheer" });
  });

  it("has everyone else boo an overpayer", () => {
    const moods = roomMoods({
      bidders,
      out: [],
      justBid: null,
      turn: null,
      sold: { who: "you", points: -200 },
    });
    expect(moods).toEqual({ you: "sheepish", margaret: "boo", vic: "boo" });
  });
});

describe("personLook", () => {
  it("gives the same person the same look every time", () => {
    expect(personLook("Ana", "#fff")).toEqual(personLook("ana", "#fff"));
  });

  it("varies between people", () => {
    const looks = new Set(
      ["Ana", "Ben", "Cat", "Dev", "Eli", "Fay"].map((n) =>
        JSON.stringify(personLook(n, "#fff")),
      ),
    );
    expect(looks.size).toBeGreaterThan(3);
  });
});

describe("avatarHtml", () => {
  it("adds a speech bubble for cheers and boos, unless turned off", () => {
    const look = personLook("Ana", "#fff");
    expect(avatarHtml(look, "cheer")).toContain("Hooray!");
    expect(avatarHtml(look, "boo")).toContain("Boo!");
    expect(avatarHtml(look, "cheer", { bubble: false })).not.toContain(
      "Hooray!",
    );
  });
});
