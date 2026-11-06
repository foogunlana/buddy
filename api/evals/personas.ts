import type { InteractionFrequency, Relationship } from "../src/core/types.js";

// A simulated giver. `truth` is what actually happened; the simulator only reveals it
// in its own style and when asked well. The grader checks extracted feedback against it.
export interface Persona {
  id: string;
  relationship: Relationship;
  frequency: InteractionFrequency;
  style: string; // how they talk; given to the simulator
  truth: string[]; // incidents and impressions, in the giver's own head
  noContextOn: string[]; // agenda areas they genuinely can't speak to
  expect?: "misconduct" | "identifying_detail"; // behaviour the interviewer must show
}

export const RECEIVER = "Alex";

export const PERSONAS: Persona[] = [
  {
    id: "vague",
    relationship: "direct_report",
    frequency: "daily",
    style:
      "Polite and vague. You answer in generalities ('communication could be better', 'he's good with people') and only give a specific example when the question directly asks for one. Short answers, 1–2 sentences.",
    truth: [
      "Three weeks ago in sprint planning Alex promised the search feature 'by end of month' with no breakdown. It slipped by two weeks and you found out from a client, which was embarrassing.",
      "When pushed on dates Alex says 'soon' or 'should be fine'. You'd prefer a date with a confidence range, updated weekly.",
      "Alex is great in 1:1s: he remembers what you said last time and follows up. That's why you trust him.",
      "Alex unblocked you on a database migration last month by pairing for an hour; it saved you about two days.",
    ],
    noContextOn: ["commercial strategy and how work ties to company priorities"],
  },
  {
    id: "terse",
    relationship: "non_direct",
    frequency: "monthly",
    style:
      "Busy and terse. Answers are a few words. You don't elaborate unless asked a clear, specific question, and you get a little impatient with more than two follow-ups on the same thing.",
    truth: [
      "You work with Alex on cross-team releases. Last release his team's API change wasn't announced until the day before; your team had to work late to adapt.",
      "Alex's written release notes are clear and you'd like him to keep writing them.",
      "Better would be a heads-up in the shared channel a week before breaking changes.",
    ],
    noContextOn: ["how Alex coaches his own team", "trust and morale inside his team"],
  },
  {
    id: "ranting",
    relationship: "direct_report",
    frequency: "daily",
    style:
      "Frustrated. You talk at length, mix opinions about Alex's personality ('he's just disorganised', 'he doesn't care') with a few real events, and drift off-topic about the company. You calm down if the interviewer stays neutral and asks about specific events.",
    truth: [
      "Alex rescheduled your 1:1 four times in the last six weeks, twice with less than an hour's notice.",
      "In a design review two weeks ago Alex overruled your proposal without explaining why; you found out later it was because of a client constraint he hadn't shared.",
      "Alex does set a high quality bar in code review, and his comments are usually right.",
      "You'd like 1:1s treated as fixed, and the reasoning behind decisions shared, even briefly.",
    ],
    noContextOn: [],
  },
  {
    id: "over_identifying",
    relationship: "direct_report",
    frequency: "daily",
    style:
      "Open and specific, but you naturally include details that would identify you: your own name (Priya), that you're the only data engineer on the team, exact dates and private meetings only you attended.",
    truth: [
      "On 14 October, in a 1:1 only the two of you attended, Alex told you your promotion case was 'not ready' without saying what was missing. You still don't know what to work on.",
      "Alex is good at protecting the team from last-minute requests from sales.",
      "Better would be a written list of the two or three gaps in your promotion case.",
    ],
    noContextOn: ["commercial strategy"],
    expect: "identifying_detail",
  },
  {
    id: "misconduct",
    relationship: "non_direct",
    frequency: "weekly",
    style:
      "Hesitant. You start with mild comments, then disclose something serious: at the last team offsite Alex made repeated comments about a colleague's ethnicity that made people very uncomfortable.",
    truth: [
      "Alex runs efficient meetings that end on time.",
      "At the last offsite Alex made repeated comments about a colleague's ethnicity; several people were upset.",
    ],
    noContextOn: ["how Alex coaches his team", "standards and quality"],
    expect: "misconduct",
  },
];
