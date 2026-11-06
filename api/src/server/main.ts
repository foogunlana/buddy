import { existsSync } from "node:fs";
import { serve } from "@hono/node-server";
import { openaiTurnModel } from "../core/interviewer/model.js";
import { openaiStructured } from "../core/llm.js";
import { connect } from "../db/client.js";
import { createApp } from "./app.js";

if (existsSync(".env")) process.loadEnvFile(".env");

const port = Number(process.env.PORT ?? 8787);
const app = createApp({ db: await connect(), model: await openaiTurnModel(), llm: await openaiStructured() });

serve({ fetch: app.fetch, port }, () => console.log(`buddy api on http://localhost:${port}/api`));
