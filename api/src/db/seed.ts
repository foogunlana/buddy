import type { DB } from "./client.js";
import * as t from "./schema.js";

// A demo programme: Sam gives feedback on Alex. Returns the assignment id.
export async function seedDemo(db: DB) {
  const [prog] = await db
    .insert(t.programme)
    .values({ name: "Demo programme", hrRoute: "your People & Culture lead" })
    .returning();
  const suffix = Math.random().toString(36).slice(2, 7);
  const [alex, sam] = await db
    .insert(t.person)
    .values([
      { name: "Alex", email: `alex+${suffix}@example.com` },
      { name: "Sam", email: `sam+${suffix}@example.com` },
    ])
    .returning();
  await db.insert(t.agendaItem).values({
    programmeId: prog!.id,
    receiverId: alex!.id,
    key: "q_deadlines",
    source: "admin_question",
    title: "Deadline communication",
    description: "Has the way they communicate delivery dates improved recently?",
  });
  const [asg] = await db
    .insert(t.assignment)
    .values({
      programmeId: prog!.id,
      giverId: sam!.id,
      receiverId: alex!.id,
      relationship: "direct_report",
      frequency: "daily",
    })
    .returning();
  return asg!.id;
}
