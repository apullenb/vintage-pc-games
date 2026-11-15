# Out on Your Own

A pixel-art life sim about the first year after high school, built with React, TypeScript, and Vite.
It's part Oregon Trail, part Game of Life: pick a starting path, then make it through 36 weeks of
real-world tradeoffs.

## How it plays

- **Choose a start.** Stay home and work, go to college, become a trade apprentice, or work full-time
  and get your own place. Each has different pay, costs, benefits, and risks.
- **Plan every week.** You have four time slots: one weekday, one evening, Saturday, and Sunday.
  The DMV and the dentist are only open on weekdays, so going costs a day of pay (or a day of class).
  Rest matters too: let your energy run out and you get sick or burn out.
- **Payday and bills.** Every other week you get a real pay stub (taxes, FICA, insurance, 401(k)).
  Bills are due every four weeks, and you decide what to pay and from where. Skipping rent twice
  ends the game.
- **Costs nobody budgets for.** Haircuts, work clothes, birthdays, holiday gifts, textbooks, move-in
  basics, and car registration land on a fixed calendar, and heating bills climb in winter. Prices
  (groceries, takeout, rent, taxes withheld) follow 2026 numbers, so money is tight but manageable.
- **Every cost asks how you'll pay.** Checking (watch for overdraft fees), savings (your emergency
  fund), or a credit card (interest, utilization, your credit score). Or wait and take the risk:
  the worn tire really can blow out.
- **Six chapters with missions and deadlines:** bank account and driver's license, transportation and
  a dental checkup, housing and a budget, credit and taxes, a big emergency, and a career milestone.
- **Learn as you go.** The Adulting Handbook unlocks plain-language explanations (W-4, deductibles,
  APR, deferred interest, security deposits, and more) as you run into them.

## Code map

- `src/engine/`: the pure game engine (state in, state out), credit score model, scoring, and scripted
  players used by tests.
- `src/content/`: paths, chapters and missions, activities, scenes, events, payday offers, handbook.
- `src/art/`: backgrounds and characters painted in code at 192x108.
- `src/ui/`: React screens.

## Development

```bash
npm install
npm run dev
npx vitest run   # rules, content wiring, full scripted playthroughs, random-player fuzzing
npm run build
```

The tests prove every starting path can be finished by a sensible player, that reckless choices
score much worse, and that random players never get stuck.
