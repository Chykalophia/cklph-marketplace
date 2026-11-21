// FIXTURE: llm lens, should-not-flag (PRECISION)
// Looks like the chat-render fixture, but:
//   - roles come from the server's own transcript table, never from the request body; the client
//     sends only its new message text, so it cannot forge a system turn
//   - model output renders through react-markdown without rehype-raw, so raw HTML is escaped, and
//     images are replaced by their alt text, so no auto-loaded URL can leak data
// Expected verdict: NO FINDING.
import ReactMarkdown from 'react-markdown';

type StoredTurn = { role: 'user' | 'assistant'; content: string };

export function buildMessages(storedHistory: StoredTurn[], newUserText: string) {
  return [...storedHistory, { role: 'user' as const, content: newUserText }];
}

export function AssistantMessage({ text }: { text: string }) {
  return (
    <ReactMarkdown components={{ img: ({ alt }) => <span>{alt}</span> }}>
      {text}
    </ReactMarkdown>
  );
}
