import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Chat } from "./Chat";
import "./styles.css";

// Three screens are planned; until there's a router, the path picks the screen.
const chatMatch = location.pathname.match(/^\/chat\/([0-9a-f-]{36})\/?$/i);

function App() {
  if (chatMatch) return <Chat assignmentId={chatMatch[1]!} />;
  return (
    <main className="page">
      <h1>buddy</h1>
      <p className="muted">Open the feedback link you were sent to start a conversation.</p>
    </main>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
