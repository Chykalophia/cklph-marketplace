// FIXTURE: llm lens, should-flag (RECALL)
// A support assistant answers a signed-in user's question with RAG over all tenants' tickets and
// can send email under the org's service identity. Planted:
//   1. match_documents is called without a tenant filter, so another tenant's ticket text enters
//      this user's context -> llm:retrieval-scope (high)
//   2. a ticket body any customer can write is retrieved into an agent that holds send_email, and
//      the tool runs with no approval from the signed-in user -> llm:cross-principal-injection +
//      llm:action-binding (high)
//   3. send_email uses the service-role client and never checks the requester may email that
//      address -> llm:confused-deputy (high)
// Expected verdict: FLAG all three.
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';

const admin = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function answer(userId: string, question: string, embedding: number[]) {
  const { data: docs } = await admin.rpc('match_documents', { query_embedding: embedding, match_count: 8 });
  const context = (docs ?? []).map((d: { body: string }) => d.body).join('\n---\n');

  return generateText({
    model: 'example-model',
    system: 'You are a helpful support agent.',
    prompt: `Context:\n${context}\n\nQuestion from ${userId}: ${question}`,
    tools: {
      send_email: tool({
        description: 'Send an email to a customer',
        parameters: z.object({ to: z.string(), subject: z.string(), body: z.string() }),
        execute: async ({ to, subject, body }) => {
          await admin.from('outbound_email').insert({ to, subject, body, sent_by: 'assistant' });
          return 'sent';
        },
      }),
    },
  });
}
