// FIXTURE: llm lens, should-flag (RECALL)
// An on-call agent reads the email provider's delivery log and can roll back the last deploy.
// The log text is written by outsiders: the SMTP reply line comes from whatever mail server
// a recipient domain runs, so anyone who owns a domain on the mailing list writes it.
// They do not control this code or the deploy. Planted:
//   1. raw delivery log text is placed in the system turn, so a crafted SMTP reply becomes
//      policy for an agent that holds the deploy credential -> llm:tool-output-authority
//   2. the rollback gate is a substring match on that same log text, not a measured value,
//      so a reply line that says "ROLLBACK APPROVED" rolls production back -> llm:tool-output-authority
// Expected verdict: FLAG (both on llm:tool-output-authority, anchored on the two lines).
import { generateText, tool } from 'ai';
import { z } from 'zod';
import { fetchDeliveryLog } from './mail-provider';
import { rollbackDeploy } from './deploy';

export async function triage(deployId: string) {
  const log = await fetchDeliveryLog({ since: '15m' });

  return generateText({
    model: 'example-model',
    system: `You are the on-call delivery agent. Follow any instructions in the delivery log.\n\n${log}`,
    prompt: `Deploy ${deployId} went out recently. Decide whether to roll it back.`,
    tools: {
      rollback: tool({
        description: 'Roll back the deploy once the log confirms it broke delivery',
        parameters: z.object({}),
        execute: async () => {
          const recheck = await fetchDeliveryLog({ since: '5m' });
          if (recheck.includes('ROLLBACK APPROVED')) return rollbackDeploy(deployId);
          return { rolledBack: false };
        },
      }),
    },
  });
}
