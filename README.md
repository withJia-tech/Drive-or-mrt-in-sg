# Drive There or MRT?

A per-trip cost comparison for Singapore car owners deciding how to get to one
specific place: drive, take the MRT, or book a Grab. Not a commute tool and
not a monthly budget — the user is at the door, deciding now.

The point of the thing is parking. Three hours at a public hospital costs more
in parking than the entire petrol bill for the round trip, and almost nobody
checks before leaving.

**Live:** https://withjia-tech.github.io/Drive-or-mrt-in-sg/

Calculator 04b of the *Is It Worth It?* suite.

## No agent, deliberately

There is no LLM call, no pipeline, no agent anywhere in this build, and there
should not be. The whole calculator is ten arithmetic rules over numbers the
user types. Learning a user's driving habits would be a large amount of
machinery to answer a question that `parkRate × parkHours` already answers
exactly.

The deterministic layer *is* the product. The useful upgrade path is better
data — real HDB and URA carpark rates — not more inference.

## Running it

ES modules will not load over `file://` — Chromium blocks the import as a CORS
violation and the page renders inert. Serve the directory:

```bash
python3 -m http.server 8099
# http://127.0.0.1:8099/
```

## Tests

```bash
node --test        # 44 tests, no dependencies, no install
```

`test/calc.test.js` covers rules D1–D10, the layer where a wrong answer is a
defect rather than a disagreement. `test/data-drift.test.js` guards the
assumption files against their inline mirror and fails if they diverge.

There are deliberately no tests on the heuristics. You cannot unit-test a
guess. They are labelled in the UI instead, which is the honest alternative.

## Layout

```
.
├── index.html          # the calculator: markup, styles, wiring
├── calc.js             # D1-D10, pure functions, no DOM
├── defaults.js         # fallback mirror + assumption loader
├── data/
│   ├── parking-defaults.json   # H1 — destination type to hourly rate
│   └── fare-defaults.json      # H2-H7 — every other assumed constant
├── shared/tokens.css   # design tokens, values only
├── docs/DECISIONS.md   # answers to the architect's open questions
├── test/
└── .github/workflows/deploy.yml
```

`shared/` keeps its name on purpose: when the rest of the suite is built, the
tokens file is what moves out first, and the path is already right.

## Where the judgment sits

Every assumed constant lives in `data/*.json`, never inline in the calculator.
That was the decision the handoff asked to close, and the reasoning is in
`docs/DECISIONS.md`. In short: a PM can change the petrol price in GitHub's
web editor and the change is a reviewable diff, which is what "auditable" has
to mean to be worth anything.

`calc.js` knows arithmetic. It does not know any of the guesses — they arrive
as arguments. That separation is what makes the deterministic layer testable
and the heuristic layer swappable. The design was rewritten wholesale once
already without touching a single number or breaking a single test.

The highest-leverage improvement available is H1. Parking rates are a
heuristic only because the data is not loaded; HDB and URA publish them. That
is a CSV, not an API, and it costs nothing. It converts the single number the
product exists to surface from a guess into a fact.

## Deploying

Repository settings → Pages → Source: **GitHub Actions**. The workflow runs
`node --test` on every push to `main` and only deploys if it passes. There is
no build step.

## Status

Prototype, P1. Accuracy is bounded: no live ERP, no live fares, no real
carpark rates, no traffic model. Every one of those is stated in the
assumptions panel and in the share string, which carries the assumptions
version so a result read months later flags its own age.
