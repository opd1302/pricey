import { avatarHtml, botLook } from "./avatars";
import { BOTS } from "./game/bots";
import { itemsForPuzzle, puzzleNumber } from "./game/daily";
import { outcomeOn, playDay, yourStanding } from "./game/day";
import { formatPrice } from "./game/money";
import { ordinal } from "./game/scoring";
import { clearActions, loadActions } from "./storage";

// Fills in the home page: today's catalogue (lots stay "sealed" until they've
// been sold) and the cards introducing the rival bidders.

const puzzle = puzzleNumber();
const items = itemsForPuzzle(puzzle);
const actions = loadActions(puzzle, items);
const day = playDay(puzzle, items, actions);

const $ = (id: string) => document.getElementById(id)!;

$("puzzle-number").textContent = String(puzzle);
$("today-date").textContent = new Date().toLocaleDateString("en-US", {
  weekday: "short",
  month: "short",
  day: "numeric",
});

$("lots").innerHTML = items
  .map((item, i) => {
    const sold = day.lots[i]?.sold;
    if (!sold) {
      return `
        <li>
          <span class="lot-no">Lot ${i + 1}</span>
          <span class="lot-what">${item.category}</span>
          <span class="lot-price">Sealed</span>
        </li>`;
    }
    const lot = day.lots[i];
    const buyer =
      sold.who === "you"
        ? "Yours"
        : sold.who
          ? BOTS.find((b) => b.id === sold.who)!.firstName
          : "Unsold";
    const mark = outcomeOn(lot, "you");
    return `
      <li class="is-sold">
        <span class="lot-no">Lot ${i + 1}</span>
        <span class="lot-what">${item.name}</span>
        <span class="lot-price"><span class="mark ${mark}"></span>${buyer} · ${formatPrice(sold.price)}</span>
      </li>`;
  })
  .join("");

if (day.finished) {
  const you = yourStanding(day.lots);
  $("catalogue-status").textContent =
    `Sale closed · you came ${ordinal(you.rank)}`;
  $("play-button").textContent = "See your results";
} else if (actions.some((lot) => lot.length > 0)) {
  $("catalogue-status").textContent =
    `Lot ${day.lots.length} of ${items.length} under way`;
  $("play-button").textContent = "Back to the auction";
}

const here = new Set(day.room.map((bot) => bot.id));
const names = day.room.map((bot) => bot.firstName);
$("room-today").innerHTML = `
  <span class="room-faces">${day.room
    .map(
      (bot) =>
        `${avatarHtml(botLook(bot.id, bot.colour), "idle", { bubble: false })}`,
    )
    .join("")}</span>
  <span>In the room today: ${names.slice(0, -1).join(", ")} and ${names.at(-1)}</span>`;

$("bidders").innerHTML = BOTS.map(
  (bot) => `
    <li class="${here.has(bot.id) ? "is-here" : ""}">
      ${avatarHtml(botLook(bot.id, bot.colour), "idle", { bubble: false })}
      <div>
        <p class="bidder-title"><strong>${bot.name}</strong> <span>${bot.title}</span></p>
        <p class="bidder-blurb">${bot.blurb}</p>
        ${here.has(bot.id) ? `<p class="here-tag">In today</p>` : ""}
      </div>
    </li>`,
).join("");

// While developing (npm run dev), add a link to replay today's game. Vite
// leaves this out of the built site, so real players never see it.
if (import.meta.env.DEV) {
  const reset = document.createElement("button");
  reset.className = "btn-ghost dev-reset";
  reset.textContent = "Reset today's game (dev only)";
  reset.addEventListener("click", () => {
    clearActions();
    location.reload();
  });
  document.querySelector(".footer")!.append(reset);
}
