# Product spec

Generic version of the original experiment spec. Organisation-specific details (real forms, real reports, names) are kept out of this repo.

## Roles

Three roles share one loop: the admin sets what must be learned, givers talk to the interviewer, receivers get a synthesised report and feed their own questions back into the next round.

### Admin

- **Creates a programme.** A fixed cycle (e.g. two weeks) or always-on with a release cadence (e.g. quarterly).
- **Picks receivers and givers.** CSV import of people and pairs; each pair tagged direct or non-direct report, plus interaction frequency (daily, monthly, ad hoc).
- **Sets the agenda.** Defaults to six dimensions (below). Per receiver, up to 3 "must learn" questions.
- **Sets rules.** Minimum givers per group before release (default 3), whether ratings are collected, release date, nudge schedule.
- **Monitors coverage, not content.** Sees response counts and which agenda items are thin. Never sees transcripts.

Default dimensions:

1. Trust & Morale: safe to speak up, ask, raise concerns
2. Listening & Respect: listens, values viewpoints
3. Execution & Delivery: clear expectations, follows through, not a bottleneck
4. Commercial & Strategy Alignment: connects team work to company priorities
5. Standards & Excellence: high quality bar, helps the team meet it
6. Feedback & Coaching: clear, constructive, timely feedback

### Giver

1. Gets a nudge (email in the MVP).
2. Opens a chat. Free recall first: "What does Alex do well that you'd want them to keep doing?", then "What's one thing they could do differently?"
3. The interviewer probes each comment until it has a behaviour, an example, the impact and a concrete ask.
4. The interviewer fills agenda gaps the giver can speak to and skips the rest.
5. The giver sees exactly what will be shared: a paraphrased, de-identified summary. They can edit, remove, or flag items as too identifying.
6. Optional: the interviewer proposes 0–5 ratings (0 = no context); the giver confirms or changes them.

### Receiver

- Adds a personal objective ("Are my 1:1s useful?"). Admin approves.
- Reads the report once each group passes the threshold.
- Commits to 1–3 actions, which become next round's agenda.
- Later: asks follow-up questions that are relayed to givers who raised a theme.

## Conversation design

Goal: turn each comment into a usable feedback item (one behaviour, one real example, its impact, what better looks like). Target 5–8 minutes; hard stop at 10.

**Probe ladder**, climbed only as far as needed:

| Rung | Missing piece | Example probe |
|---|---|---|
| 1. Behaviour | Comment is a trait ("disorganised") | "What did you see them do or not do?" |
| 2. Example | No specific instance | "When was the last time? What was going on?" |
| 3. Impact | No consequence | "What did that cost you or the team?" |
| 4. Ask | No alternative | "What would better have looked like?" |
| 5. Frequency | One-off vs pattern | "Is that typical, or one time?" |

**Agenda pass:** after free recall, one open question per uncovered agenda item (admin dimensions, receiver objectives, last round's committed actions). "I don't have context" is a valid answer.

**Interviewer rules:**

- Neutral. Never agrees, argues, defends the receiver, or fishes for negatives.
- Open questions only, no leading.
- One question per turn. At most 2 probes per comment before moving on.
- Prefer task-level detail over personality (Kluger & DeNisi 1996: feedback aimed at the self backfires).
- Warns live when a detail could identify the giver: keep, generalise or drop?
- Misconduct (harassment, discrimination, safety): stop, offer the formal HR route, keep it out of the report.

**Done when:** every item has behaviour + example + ask or the giver passes; agenda covered or skipped; or 10 minutes.

## Anonymity and trust model

No person reads a raw transcript. The receiver only sees pooled, paraphrased output.

| Layer | Rule |
|---|---|
| Transcripts | Encrypted, readable only by the pipeline. Deleted after synthesis plus a retention window (default 90 days). |
| Feedback items | Extracted per conversation, paraphrased to strip writing style, giver-approved before pooling. |
| Thresholds | A group (direct, non-direct) appears only with ≥3 givers; otherwise merged into "all colleagues" or held. |
| Timing | Year-round entries released in batches on a fixed date, never one by one. |
| Quotes | Paraphrased only, and only for themes raised by ≥2 givers, unless the giver opts a quote in. |
| Specific details | Flagged live; synthesis also removes unique projects, dates and names. |
| Ratings | Group averages only. |

Open tensions: year-round release vs guessability in small teams; follow-up relays revealing small theme sets; misconduct handling under full anonymity; givers not trusting "no human reads this"; data protection (employee feedback is personal data, so a DPIA-style note is needed before any pilot).

## Receiver report

Order:

1. **Your questions answered.** Each objective and must-learn question: direct answer, number of givers, confidence. Says so when signal is thin.
2. **Summary.** Three to five sentences.
3. **Keep doing.** Themes with giver count (e.g. 5 of 9), direct/non-direct split, 1–2 paraphrased examples, why it mattered.
4. **Change.** Same shape plus the givers' concrete asks.
5. **By dimension.** Group-average ratings, self-rating beside them if collected.
6. **Since last time.** Progress on last round's committed actions.
7. **What we couldn't find out.** Agenda items with fewer than 3 voices.

Rules: every theme cites its evidence count; single-giver themes are labelled as one voice; concrete asks beat adjectives; no ranking against other receivers by default; ends with "pick 1–3 actions".

## Data model

`person`, `programme`, `agenda_item`, `assignment` (giver, receiver, relationship, frequency), `conversation` + `message` (encrypted), `feedback_item` (theme, polarity, dimension, behaviour, example, impact, ask, specificity score, approved), `rating`, `report` (structured JSON), `action`.

## Prior art

- **Your360 AI**: voice coach interviews colleagues, builds a growth plan with the receiver. Closest analogue; coaching pitch, not HR-run.
- **Hybrid360**: AI interviews with adaptive follow-ups replacing rating scales.
- **EchoSpan**: traditional 360 with AI writing help; good reference for anonymity controls.
- **Anthropic Interviewer**: plan → interview → analyse, with humans approving the plan.

Evidence:

- Xiao et al., "Tell Me About Yourself" (ACM TOCHI, [arXiv:1905.10700](https://arxiv.org/abs/1905.10700)): probing chatbot beat Qualtrics on informativeness, relevance, specificity and clarity across 5,200+ responses.
- Kluger & DeNisi 1996: 607 effect sizes, mean d = 0.41, but over a third of feedback interventions made performance worse; task-focused feedback works, self-focused backfires.
- An anonymity floor of 3 per group is standard across EchoSpan, Glint and Leadership Circle.
