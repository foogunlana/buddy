# Build plan

The riskiest assumption is that the interviewer actually gets more specific, actionable feedback than a form. Everything else (auth, admin screens, report UI) is ordinary web work. So the plan tests the interviewer first, with simulated givers, before building the app around it.

Each milestone has an exit check. Don't start the next one until it passes.

## M0 — Repo and decisions

- [x] Public repo, MIT licence, README, spec, plan
- [ ] Decide the three blocking questions (see [Open questions](#open-questions)): who this is for, pilot timing, the anonymity line
- [ ] Set up the TypeScript workspace: `packages/core`, `evals/`, `apps/web` (empty), lint, test runner, CI

Exit: `pnpm test` runs green in CI on an empty core package.

## M1 — Interviewer core and eval harness

The core hypothesis, tested offline. No web app, no database.

- [ ] `packages/core/interviewer`: system prompt built from an agenda; turn loop that tracks which items are open and which probe rung each comment is on; stop rules (coverage, giver passes, 10 min / turn cap); identifying-detail and misconduct handling
- [ ] CLI to chat with the interviewer in the terminal against a sample agenda
- [ ] `evals/personas`: ~20 simulated givers, each with a hidden "true experience" of the receiver (3–5 real incidents) and a style: vague, terse, ranting, off-topic, over-identifying, no-context, disclosing misconduct
- [ ] Form baseline: the same personas fill in a form-style prompt (two open boxes, no follow-up)
- [ ] Extractor (shared with M2) turns each transcript or form answer into `feedback_item`s
- [ ] Judge rubric: for each item, is it specific (behaviour + example), actionable (concrete ask), faithful to the persona's true experience (no invented detail), and task-focused rather than self-focused
- [ ] Run layout: one immutable JSON per run in `evals/runs/` with the full config (model IDs, prompt hash, persona set, seed) and a dated notebook per analysis

Exit:

- Interviewer produces ≥2× the specific-and-actionable items per persona of the form baseline
- Zero invented details in a manual check of 20 transcripts
- Misconduct persona always routed to the HR path; never extracted as an item
- Median simulated conversation within 8 turns per comment budget

If the 2× bar fails, iterate on the prompt and probe ladder here. Don't build the app on a weak interviewer.

## M2 — Extraction, anonymisation, synthesis

Still offline, still in `packages/core`.

- [ ] Extractor: transcript → items with theme, polarity, dimension, behaviour, example, impact, ask, specificity score
- [ ] Paraphraser: rewrite each item to strip writing style and identifying details (names, unique projects, dates)
- [ ] Threshold logic: group by relationship; suppress or merge groups under the floor; quote rules (≥2 givers or opt-in)
- [ ] Synthesiser: pooled items → report JSON in the spec's order (questions answered, summary, keep doing, change, by dimension, since last time, gaps)
- [ ] Unit tests for threshold and merge logic (pure functions, no model calls)
- [ ] Re-identification eval: a judge model is given the report plus the persona list and tries to attribute each theme to a giver

Exit:

- Threshold tests pass, including the edge cases (2 direct + 5 non-direct, 1 giver total, all no-context)
- Re-identification judge does no better than chance on paraphrased output
- Every theme in the report traces back to ≥1 approved item (no orphan claims)

## M3 — Web app MVP

Wrap the core in the smallest app that can run one real cycle.

- [ ] Next.js app, Postgres, migrations for the spec's data model
- [ ] Magic-link email login; three roles
- [ ] Admin: one programme, CSV import of people and pairs, agenda (defaults + per-receiver questions), threshold, release date, coverage view (counts only)
- [ ] Giver: chat UI on the M1 interviewer (streamed), share preview with edit / remove / "too identifying", optional rating confirm
- [ ] Receiver: add one objective, read report after release, pick 1–3 actions
- [ ] Release job: on release date, run M2 synthesis per receiver and store the report
- [ ] Transcript encryption at rest; retention job that deletes transcripts after the window

Exit: an end-to-end run with 3 fake receivers and 12 fake givers (driven by M1 personas through the real UI or API) produces correct reports, and no admin or receiver route can return a transcript (tested).

## M4 — Pilot readiness

- [ ] Privacy page for givers, in plain words: what is stored, who sees what, when it is deleted
- [ ] DPIA-style note (purpose, lawful basis, data flows, retention, model provider terms)
- [ ] Deploy (single tenant), backups, error monitoring with transcript content scrubbed from logs
- [ ] Email nudges and reminders
- [ ] Pilot measurement: receivers rate items specific / actionable blind to source; giver time logged; post-chat preference question

Exit: one internal dry run with friendly volunteers, no blocking issues.

## M5 — Pilot

- 4–6 receivers who opt in, about 30 givers
- Each giver does the existing form for one receiver and the chat for another, order randomised
- Measures: actionable items per giver (blind-rated by receivers), giver minutes, giver preference, edit/remove rate at preview
- Success bar: ≥2× actionable items per giver at ≤1.5× giver time
- Write-up of results in `docs/`, including where it failed

## After the MVP

In rough priority order, only if the pilot clears the bar:

1. Receiver follow-up questions relayed to givers (needs a fix for the small-set anonymity problem)
2. Year-round collection with batched release
3. Trends across rounds ("since last time")
4. Google Chat / Slack nudges
5. Voice
6. Multi-tenancy and SSO, if anyone outside the first org wants it

## Workstreams for parallel agents

Once M0 is done, these can run in parallel against fixed interfaces:

| # | Workstream | Output | Depends on |
|---|---|---|---|
| 1 | Data model + app shell + admin | Running app with roles and programme setup | `agenda_item`, `feedback_item` types in core |
| 2 | Interviewer | Prompt, turn loop, stop rules, CLI | Agenda type |
| 3 | Eval harness | Personas, form baseline, judge, run layout | 2 |
| 4 | Extraction + anonymisation + synthesis | Report JSON | `feedback_item` type |
| 5 | Receiver report UI | Report page and action picker | Report JSON schema from 4 |

Freeze the shared types (`Agenda`, `FeedbackItem`, `Report`) in `packages/core/types.ts` first; that is the only coordination point.

## Open questions

The first three block M1 design choices; the rest can default.

1. **Who is this for?** One org's internal experiment, or a self-hostable tool for any org? Defaults to the second in the repo (generic, single-tenant), tested with the first.
2. **Pilot timing.** When does the next real cycle open, and who is the admin? M3 needs to land before it.
3. **Anonymity line.** Is "no human ever reads a transcript" absolute, or can an admin read in narrow cases? What happens on a misconduct disclosure?
4. **Ratings.** Keep the 0–5 grid, have the interviewer propose ratings, or drop numbers for the pilot? Default: propose and confirm.
5. **Receiver objectives.** Do givers see "Alex wants to know about X"? Default: yes, admin approves.
6. **Model provider and data.** Fine to send employee feedback to the Claude API? Any data residency constraint?
7. **Text or voice.** Default: text for the MVP.
8. **Who gets reviewed.** Managers only, or peers too? Default: managers only.
