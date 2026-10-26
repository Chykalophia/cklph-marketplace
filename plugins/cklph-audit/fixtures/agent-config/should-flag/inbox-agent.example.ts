// FIXTURE — agent-config lens · should-flag (RECALL)
// An agent runtime that reads inbound email (untrusted) and lets the model's tool call drive a
// shell command and a file write. Planted:
//   1. tool input from model output reaches execSync with no allowlist -> agentcfg:runtime-unvalidated-action (high)
//   2. model-chosen path is joined and written with no workspace containment check -> agentcfg:runtime-unvalidated-action (high)
//   3. the API key is placed in the model context -> agentcfg:runtime-secret-exposure (high)
// Expected verdict: FLAG all three. Trace: email body -> model -> tool_use.input -> side effect.
import Anthropic from '@anthropic-ai/sdk';
import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const client = new Anthropic();

export async function handleInbound(emailBody: string, workspace: string) {
  const msg = await client.messages.create({
    model: 'example-model',
    max_tokens: 1024,
    system: `You are an inbox assistant. Billing API key: ${process.env.BILLING_API_KEY}`,
    tools: [
      { name: 'run', description: 'run a shell command', input_schema: { type: 'object', properties: { cmd: { type: 'string' } } } },
      { name: 'save', description: 'save a note', input_schema: { type: 'object', properties: { file: { type: 'string' }, text: { type: 'string' } } } },
    ],
    messages: [{ role: 'user', content: emailBody }],
  });

  for (const block of msg.content) {
    if (block.type !== 'tool_use') continue;
    const input = block.input as { cmd?: string; file?: string; text?: string };
    if (block.name === 'run' && input.cmd) execSync(input.cmd);
    if (block.name === 'save' && input.file) writeFileSync(path.join(workspace, input.file), input.text ?? '');
  }
}
