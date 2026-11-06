# buddy

An AI interviewer for 360 feedback. Instead of a form filled in once a cycle, each giver has a short conversation that keeps asking until every comment is specific, evidenced and actionable. The receiver gets a pooled, anonymised report built around the questions that were set in advance.

> Status: pre-alpha. The interviewer runs in the terminal; nothing else yet. See [docs/PLAN.md](docs/PLAN.md) for the build plan and [docs/SPEC.md](docs/SPEC.md) for the product spec.

## Why

Form-based 360s are low signal:

- **Batched.** Everything is collected in one window, so people rate the last six weeks, not the last six months.
- **Tedious.** One person often reviews several colleagues in one sitting. Quality drops by the third.
- **Lossy.** Open-text boxes carry the most useful signal but nobody probes them, so "communicate better" ships as-is.
- **Criteria-heavy.** Lots of ratings, little on what matters for this person right now.

An interviewer in the middle can probe ("When was the last time? What did it cost? What would better look like?"), hold anonymity, run all year, and steer to an agenda.

## The hypothesis

For the same people and period, AI-probed feedback produces more improvement items that the receiver rates specific and actionable than a form does, at no more giver time.

The first milestone tests this with simulated givers before any web app exists.

## How it works

1. **Admin** sets up a programme: who gives feedback to whom, the agenda (default six dimensions plus per-receiver "must learn" questions), the anonymity threshold and release date.
2. **Giver** chats with the interviewer for 5–8 minutes, then reviews a paraphrased, de-identified preview of exactly what will be shared.
3. **Receiver** reads a report once each group has at least 3 givers: their questions answered first, then themes with evidence counts and concrete asks. They commit to 1–3 actions, which become next round's agenda.

No admin or receiver screen ever shows a transcript or who said what. In this early version transcripts are stored in plain text in the database, so people with database access can read them; encryption comes later.

## Stack (planned)

- `api/`: TypeScript, Postgres
- `ui/`: React
- LLM: OpenAI by default (`OPENAI_MODEL`, default `gpt-5.5`); Claude also supported with `--provider claude`
- Core logic (interviewer, extractor, anonymiser, synthesiser) lives in `api/src/core` with no web or database imports, so it can be evaluated on its own

## Repo layout (planned)

```
api/
  src/core/     interviewer, extraction, anonymisation, synthesis
  src/db/       schema, migrations, queries
  src/routes/   HTTP endpoints
  evals/        simulated giver personas, judge rubrics, run outputs
ui/             admin, giver chat, receiver report
docs/           spec, plan
```

## Try the interviewer

```
cd api
npm install
echo 'OPENAI_API_KEY=sk-...' > .env   # gitignored
npm run chat -- --name Alex --relationship direct_report --frequency daily --debug
```

`--debug` prints the interviewer's tracked state after each turn. Type `/quit` to stop. Transcripts are saved to `api/transcripts/` (gitignored).

## Run the simulated-giver eval

```
npm run eval                                  # all personas
npm run eval -- --personas vague,terse --quiet
```

Each persona (vague, terse, ranting, over-identifying, misconduct) has a hidden "true experience" of the receiver. A simulated giver plays the persona in a real conversation with the interviewer, then a grader scores the transcript: usable items (behaviour + example + ask, faithful, task-focused), how much of the hidden truth surfaced, leading or multi-part questions, and whether misconduct and identifying details were handled. Each run is saved to `api/evals/runs/`.

## Build a report from an eval run

```
npm run report -- evals/runs/<run>.json            # needs 3+ givers, else the report is held
npm run report -- evals/runs/<run>.json --floor 1  # force a report from fewer givers, for testing
```

Each persona's conversation counts as one giver. The pipeline extracts feedback items, auto-approves them (standing in for the giver's share preview), paraphrases them to remove identifying details, applies the release rules, and synthesises the report. All counts are computed in code from the items each theme cites.

To see a run stage by stage in the browser:

```
npm run view -- evals/reports/<report>.json   # writes <report>.html next to it
```

The page shows each conversation, the items extracted and anonymised from it, the release decision, and the final report. Click a theme to highlight the items it was built from.

## Licence

MIT. See [LICENSE](LICENSE).
