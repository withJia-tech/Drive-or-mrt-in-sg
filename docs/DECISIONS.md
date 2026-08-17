# Architect decisions — Calculator 4b

Answers to the open questions in section 8 of the handoff, plus the one
decision section 10 asked to close. Each records what was decided, why, and
what it costs.

---

## The decision section 10 asked for

**Q2 — where do the heuristic constants live?**

**Decided: externalised to `data/*.json`, with a tested inline mirror.**

The recommendation in the handoff was right, but it is in direct conflict with
an acceptance criterion, and that conflict is worth naming rather than
quietly resolving.

Section 7 says *"Single file, no build step, no external dependency beyond
Google Fonts."* Section 10 says externalise the constants. Both cannot hold.
Externalising is the one that survives, because the reason for it — a PM
revising a petrol price without a developer — is a product capability, while
"single file" is an implementation preference. What actually mattered in that
criterion is preserved in full:

| Criterion intent | Still true? |
|---|---|
| No build step | Yes — no bundler, no transpiler, no npm install to deploy |
| No runtime dependencies | Yes — the only external request is Google Fonts |
| Deploys to static hosting unchanged | Yes — `git push`, nothing else |
| Literally one file | **No.** Four files, all plain text |

**How a non-developer changes an assumption now:** open
`data/fare-defaults.json` in GitHub's web editor, change the number, commit.
Pages redeploys. No local toolchain, no developer, and the change is visible
in the repository history as a diff — which is what "auditable" has to mean if
it is to mean anything.

**The cost, stated honestly:** two extra network requests, and a page that now
depends on a fetch succeeding. That is mitigated, not ignored — see the mirror
below.

### The mirror, and what it actually protects against

`defaults.js` holds a copy of both JSON files. If the
fetch fails, the calculator runs on the copy and says so in the colophon
rather than rendering blank or, worse, rendering wrong numbers silently.

Two copies of the same constants is exactly the arrangement that rots, so it
is under test. `test/data-drift.test.js` deep-compares them and fails with a
message naming which file to fix. **Verified:** changing `petrolPrice` in the
JSON alone takes the suite from 40 passing to 1 failing, with the message
`data/fare-defaults.json and defaults.js have drifted
apart`.

**A claim that was tested and turned out false.** The mirror was originally
justified partly as "keeps the page working when opened straight off disk."
It does not. Chromium blocks ES module imports over `file://` as a CORS
violation, so `defaults.js` never loads and the fallback never runs — the page
is inert before any fetch is attempted. The mirror's real value is narrower
and still worth having: a partial deploy, a renamed path, a 404, a dropped
connection. Local development needs `python3 -m http.server`, like any other
ES-module project.

---

## The remaining questions

**Q1 — shared CSS extraction timing.**
**Decided: tokens only, as recommended.** `shared/tokens.css` holds values and
nothing else; the moment it grows a component selector it stops being a token
file. Component CSS stays inside the calculator. With one calculator built
there is no evidence yet about which components are genuinely shared —
extracting now would be guessing at an interface. Revisit at four.

**Q3 — is `calc.js` worth extracting for testability?**
**Decided: yes.** It is the highest-value split in the build. Rules D1–D10 are
now 40 unit tests that run in under a second with no framework and no
dependencies, on the layer the handoff itself describes as *"a defect, not a
disagreement."* The self-containment lost is the same self-containment already
given up for Q2, so the marginal cost is zero.

The heuristics in 5.2 deliberately have **no** tests. You cannot unit-test a
guess; you can only label it, which the assumptions panel does instead.

**Q4 — versioning of assumptions.**
**Decided: date-based version stamped into every shared string.** Share output
ends with `estimates only, assumptions 2026.08`. A date-shaped version is
readable by the person receiving the message, which a semver would not be, and
it makes staleness self-evident: a result stamped `2026.08` read in 2027 flags
itself. The colophon also carries `last reviewed`, addressing the section 9.2
item about stale petrol prices being visible rather than silently wrong.

**Q5 — suite navigation.**
**Deferred, with a reason.** Generating an index from a manifest is the right
answer for six calculators, but this build ships one, and the other four are
not in this repository. Hardcoding links to pages that do not exist would ship
four broken links. Revisit when the suite is co-located.

**Q6 — analytics.**
**Not built, recommendation recorded.** Nothing was added, because adding a
third-party script to a page whose entire trust proposition is "we tell you
what we assumed" needs a deliberate decision rather than a default. When it is
wanted, Plausible or Umami on the free tier, and the three events named in
section 9.2 are the right three.

**Q7 (H7) — the $5 verdict threshold.**
**Left as specified, deliberately.** D9 specifies a flat $5; H7 notes the
proportional alternative `max(5, 0.15 x driveTotal)` as a fix path. Those
conflict, and D9 is the specification while H7 is a note, so the flat value
ships. It now lives in `data/fare-defaults.json` alongside a caveat recording
the alternative, so changing it is a one-line data edit rather than a
refactor. The boundary is exclusive at both edges and tested: exactly $5 apart
reads as "too close to call."

---

## Things found while building

**Three "Cheapest" badges at once.** `[hidden]` gets `display: none` from the
UA stylesheet, which any author `display` rule outranks. Every toggle in the
page sets `hidden` on something also styled `flex`, `block` or `inline-block`,
so the attribute was being silently ignored — three winner badges, and a
`$0.00` ERP row that was supposed to be suppressed. Fixed with a single
`[hidden] { display: none !important; }` and a regression check asserting
exactly one badge is visible. Worth knowing because it is invisible in code
review and only shows up on screen.

**Collapsible headers are `<button>`, not `<div role="button">`.** Section 9.2
lists `role="button"`, `tabindex` and Enter/Space handling as three separate
items of missing work. Using the real element delivers all three and cannot be
forgotten later. Keyboard toggling is verified.

**Grab journey time had no rule.** The handoff gives assumed speeds for
driving (H3) and MRT (H4) but a three-way comparison needs three times. Grab
uses the drive speed without the parking buffer, since nobody hunts for a
space in a Grab. Recorded in `data/fare-defaults.json` as `grabDerivation` so
it is an auditable assumption rather than a silent one.

**Six categories, five rates.** Section 2 specifies six destination types; H1
lists five values. Resolved as five auto-filling categories plus "Somewhere
else", which fills nothing and focuses the rate field. A test asserts exactly
one category opts out of auto-fill.

**`destType` required or not.** Section 4 marks it `REQUIRED`; the validation
rule below says it is "strongly encouraged but not blocking". The validation
rule is the more specific statement, so only `distance` and `parkHours` gate
the button. The progress strip still tracks destination type, so it reads as
incomplete without nagging.

---

---

## Revision: design port, and the agentic question closed

**The visual design is Mizuno's, ported from her artifact.** The first build
used an editorial serif treatment; it was replaced wholesale by the maximalist
neo-brutalist design — Bricolage Grotesque, coral and cobalt, hard offset
shadows, emoji-led option cards. The engineering underneath is unchanged: the
same `calc.js`, the same `data/*.json`, the same tests. That is the point of
having the split — a total visual rewrite touched no arithmetic and broke no
test.

Three things changed in the model as a result, all adopted from the artifact:

- **Destination categories.** Six categories now map H1's five rates properly:
  HDB, heartland mall, CBD/Orchard, public hospital, private hospital, and
  "Other" which auto-fills nothing. Public and private hospitals are split,
  which matters — $3.00 against $5.50 is the difference between a $9 and a
  $16.50 visit, and the product exists to surface exactly that.
- **Journey times are return figures.** Every cost in the calculator is a
  return figure, so a one-way time printed beside a return cost invited the
  wrong comparison. There is now a test asserting the doubling holds.
- **A "if you price the walk" line.** Shown as a soft secondary row. H8 still
  holds: the MRT headline is fare-only, and a test asserts it.

**Agentic capability: none, and none warranted.** Tier 2 in the handoff —
learning driving habits, adaptive defaults from history — is not built and is
not recommended. Assessed against the eight-factor lens, this problem is not
orchestration-driven or credulity-driven; it is a ten-rule arithmetic problem
over numbers the user types in. The rung on the ladder is *deterministic
code*, and the rung above (single agent + tools) buys nothing, because there
is no judgment to delegate: `parkRate × parkHours` is not an inference. The
one real accuracy gap is data, and data is a CSV.

Recorded here because "no agent needed" is a finding, not an omission.

## Things kept from the original build

Two additions to the artifact, both small, both removable if unwanted:

- **An "estimates only" disclaimer** in the colophon. The artifact did not
  carry one. The tool prices hospital trips, and section 9.2 lists it as a
  production requirement, so it ships.
- **An assumptions disclosure** in the results, collapsed by default, listing
  every heuristic and its logic ID. This is the mechanism that makes
  "assumptions in the open" true rather than merely claimed.

Two corrections to the artifact's own code, both a11y:

- Card headers were `<div>` with a click handler — not reachable by keyboard.
  They are `<button>` now.
- Collapsed cards used `max-height: 0` alone, which hides content visually but
  leaves every field inside it in the tab order, so keyboard focus vanished
  into a closed panel. Adding `visibility: hidden` fixes it.

The footer's prev/next links pointed at `#`. They are now marked "soon"
rather than rendering as working links to calculators that do not exist.

## Verification

- `node --test` — 44 unit tests, all passing.
- 48 browser assertions against the acceptance criteria in section 7, driven
  through Chromium at 360px. All pass. Google Fonts is blocked by this build
  sandbox and is filtered by request URL rather than by console text, so a
  genuine failed request would still fail the run.
- Fallback path exercised by removing `data/` and reloading: identical totals,
  and the colophon reports it is running on built-in assumptions.

Not verified, and needing a real device: clipboard write on iOS Safari. The
handler has an explicit failure branch with a `prompt()` escape hatch, but a
headless browser is not evidence that it behaves on the platform where it is
most likely to fail.
