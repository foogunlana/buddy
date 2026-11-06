# Eval log

One entry per eval run worth remembering: what ran, what it showed, what to fix. Raw runs live in `api/evals/runs/`.

## 2026-11-06 — first live run, `vague` persona

- Run: `api/evals/runs/2026-11-06T13-04-17-515Z.json`
- Config: `gpt-5.5` for interviewer (medium effort), giver (low) and grader (high); `--max-turns 10`
- Tokens: 21.8k in / 14.1k out

| Truth surfaced | Items | Usable | Unfaithful | Leading | Multi-question turns | Non-neutral | Ended |
|---|---|---|---|---|---|---|---|
| 4/4 | 5 | 2 | 0 | 0 | 1 | 0 | turn limit |

What worked: got from "communication could be better" to the slipped search feature, the client finding out first, the "soon / should be fine" pattern, and the hour of pairing. Stayed neutral. Accepted "no context" on commercial strategy.

To fix (not yet done):

1. **Over-flags identifying details, which kills specificity.** It flagged "sprint planning, the search feature, the client" and "a database migration" as identifying; the giver generalised both away. Those don't identify one person on a team. Only flag details that single out the giver (their own name, a 1:1 only they attended, a unique role). Leave team-level scrubbing to synthesis, after pooling.
2. **Doesn't complete each item.** Never asked for the ask on the 1:1s "keep" item, or the impact of the slipped deadline. Only 2 of 5 items usable. The prompt should check every comment for behaviour, example, impact and ask before moving on.
3. **Agenda pass is slow.** One open question per uncovered dimension uses a lot of turns; this run hit the 10-turn eval cap. Consider batching or skipping dimensions the giver's relationship makes unlikely. (Real cap is 30.)
4. Minor: one turn asked two questions at once; one generic "what else?" question.

Caveat: one simulated giver, one run. Treat as a signal, not proof.
