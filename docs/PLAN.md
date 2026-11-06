# Build plan

The riskiest assumption is that the interviewer actually gets more specific, actionable feedback than a form. Everything else (auth, admin screens, report UI) is ordinary web work. So the plan tests the interviewer first, with simulated givers, before building the app around it.

Each milestone has an exit check. Don't start the next one until it passes.

## Decisions (Nov 6, 2026)

- **Who it's for:** internal Stears users. Single org, no multi-tenancy. The code is public; real Stears data never enters the repo.
- **When:** start M1 now. Pilot timing is set after M1 passes.
- **Anonymity:** the product is fully anonymous. No admin or receiver screen ever shows a transcript or who said what. For now, transcripts are stored in plain text in the database, so anyone with database access can read them. Encryption and deletion come later. The privacy page must say this plainly.
- **M1 baseline skipped (Nov 6):** there's no real form data to build a fair baseline. Treat the interviewer as good enough, build the whole pipeline, and optimise the interviewer once everything runs end to end. Known interviewer issues are in [EVAL-LOG.md](EVAL-LOG.md).
- **Repo layout:** two top-level folders, `api/` and `ui/` (below).

## Repo layout

```
api/
  src/core/     interviewer, extraction, anonymisation, synthesis (no web or DB imports)
  src/db/       schema, migrations, queries
  src/routes/   HTTP endpoints for admin, giver, receiver
  evals/        personas, form baseline, judge, runs/
ui/
  src/          admin, giver chat, receiver report
docs/
```

`api/src/core` stays free of web and database code so the evals can run it directly.

## M0 — Repo setup

- [x] Public repo, MIT licence, README, spec, plan
- [x] Decide who it's for, timing, anonymity line
- [x] Scaffold `api/` (TypeScript, Vitest, `tsc` typecheck); `ui/` stays empty until M3
- [x] Freeze shared types in `api/src/core/types.ts`: `Agenda`, `FeedbackItem`, `Report`
- [x] CI runs `api` typecheck and tests

Exit: tests run green in CI on an empty core.

## M1 — Interviewer core and eval harness

The core hypothesis, tested offline. No web app, no database.

- [x] `api/src/core/interviewer`: system prompt built from an agenda; turn loop that tracks which items are open and which probe rung each comment is on; stop rules (coverage, giver passes, 10 min / turn cap); identifying-detail and misconduct handling (unit-tested with a fake model; not yet run live)
- [x] CLI to chat with the interviewer in the terminal against a sample agenda
- [ ] `api/evals/personas`: ~20 simulated givers (5 written: vague, terse, ranting, over-identifying, misconduct), each with a hidden "true experience" of the receiver (3–5 real incidents) and a style: vague, terse, ranting, off-topic, over-identifying, no-context, disclosing misconduct
- [ ] Form baseline: the same personas fill in a form-style prompt (two open boxes, no follow-up)
- [ ] Extractor (shared with M2) turns each transcript or form answer into `feedback_item`s
- [x] Judge rubric (`api/evals/grade.ts`), run against simulated conversations (`npm run eval`): for each item, is it specific (behaviour + example), actionable (concrete ask), faithful to the persona's true experience (no invented detail), and task-focused rather than self-focused
- [x] Run layout: one immutable JSON per run in `api/evals/runs/` with the full config (model IDs, prompt hash, persona set, seed) and a dated notebook per analysis

Exit:

- Interviewer produces ≥2× the specific-and-actionable items per persona of the form baseline
- Zero invented details in a manual check of 20 transcripts
- Misconduct persona always routed to the HR path; never extracted as an item
- Median simulated conversation within 8 turns per comment budget

Findings from eval runs are logged in [EVAL-LOG.md](EVAL-LOG.md).

If the 2× bar fails, iterate on the prompt and probe ladder here. Don't build the app on a weak interviewer.

## M2 — Extraction, anonymisation, synthesis

Still offline, still in `api/src/core`.

- [x] Extractor: transcript → items with theme, polarity, dimension, behaviour, example, impact, ask, specificity score
- [x] Paraphraser: rewrite each item to strip writing style and identifying details (names, unique projects, dates)
- [x] Threshold logic: group by relationship; suppress or merge groups under the floor; quote rules (≥2 givers or opt-in)
- [x] Synthesiser: pooled items → report JSON in the spec's order (questions answered, summary, keep doing, change, by dimension, since last time, gaps)
- [x] Unit tests for threshold and merge logic (pure functions, no model calls)
- [ ] (not built yet) Re-identification eval: a judge model is given the report plus the persona list and tries to attribute each theme to a giver

Exit:

- Threshold tests pass, including the edge cases (2 direct + 5 non-direct, 1 giver total, all no-context)
- Re-identification judge does no better than chance on paraphrased output
- Every theme in the report traces back to ≥1 approved item (no orphan claims)

## M3 — Web app MVP

Wrap the core in the smallest app that can run one real cycle.

- [x] `api/`: Hono, Drizzle on Postgres (Docker), migrations, chat routes (people, programme, agenda, assignment, conversation, message)
- [ ] `ui/`: Vite + React app for the three roles (giver chat done)
- [ ] Magic-link login (links print to the terminal for now); three roles
- [ ] Admin: one programme, CSV import of people and pairs, agenda (defaults + per-receiver questions), threshold, release date, coverage view (counts only)
- [x] Giver: chat UI on the M1 interviewer (not streamed), share preview with edit / remove / "too identifying" (ratings deferred until after the pilot)
- [ ] Receiver: add one objective, read report after release, pick 1–3 actions
- [ ] Release job: on release date, run M2 synthesis per receiver and store the report

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
6. Transcript encryption at rest and a retention job that deletes transcripts
7. SSO

## Workstreams for parallel agents

Once M0 is done, these can run in parallel against fixed interfaces:

| # | Workstream | Output | Depends on |
|---|---|---|---|
| 1 | Data model + app shell + admin | Running app with roles and programme setup | `agenda_item`, `feedback_item` types in core |
| 2 | Interviewer | Prompt, turn loop, stop rules, CLI | Agenda type |
| 3 | Eval harness | Personas, form baseline, judge, run layout | 2 |
| 4 | Extraction + anonymisation + synthesis | Report JSON | `feedback_item` type |
| 5 | Receiver report UI | Report page and action picker | Report JSON schema from 4 |

Freeze the shared types (`Agenda`, `FeedbackItem`, `Report`) in `api/src/core/types.ts` first; that is the only coordination point.

## Open questions

None block M1. Defaults hold unless changed.

1. **Misconduct.** Default: the interviewer stops, points to the formal HR route, and keeps it out of the report.
2. **Pilot timing and admin.** When does the next real cycle open, and is People & Culture the admin? Set after M1 passes.
3. **Ratings.** Keep the 0–5 grid, have the interviewer propose ratings, or drop numbers for the pilot? Default: propose and confirm.
4. **Receiver objectives.** Do givers see "Alex wants to know about X"? Default: yes, admin approves.
5. **Model provider and data.** Fine to send employee feedback to the Claude API? Any data residency constraint?
6. **Text or voice.** Default: text for the MVP.
7. **Who gets reviewed.** Managers only, or peers too? Default: managers only.
