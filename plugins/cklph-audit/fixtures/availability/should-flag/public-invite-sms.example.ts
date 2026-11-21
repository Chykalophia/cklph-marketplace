// FIXTURE: availability lens, should-flag (RECALL)
// A public "invite your team" route handler. Anyone can call it, and it pays for every unit of work.
// Planted:
//   1. no session check, no Upstash limiter, no usage ledger, and max_tokens is unset: any anonymous
//      caller makes the operator pay for OpenAI completions and Twilio SMS -> availability:denial-of-wallet (high;
//      pre-auth and multiplied by item 2, the worst case, which the anchors still cap at high)
//   2. `phones` comes from the body with no length cap, and each entry costs one completion plus one
//      SMS, so one request with 5,000 numbers is 10,000 paid calls -> availability:unbounded-fanout (high)
//   3. `note` has no length cap and is pasted into every prompt, so input tokens scale with it times
//      the fan-out -> availability:unbounded-input (medium)
// Expected verdict: FLAG all three.
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import twilio from 'twilio';

const openai = new OpenAI();
const sms = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);

export const maxDuration = 300;

type InviteBody = { teamName: string; note: string; phones: string[] };

export async function POST(req: Request) {
  const { teamName, note, phones } = (await req.json()) as InviteBody;
  if (!teamName || !Array.isArray(phones)) {
    return NextResponse.json({ error: 'teamName and phones are required' }, { status: 400 });
  }

  const results = await Promise.all(
    phones.map(async phone => {
      const completion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: 'Write a friendly one-line SMS inviting someone to join a team.' },
          { role: 'user', content: `Team: ${teamName}\nPersonal note: ${note}` },
        ],
      });
      const body = completion.choices[0]?.message.content ?? `Join ${teamName}!`;
      const message = await sms.messages.create({ to: phone, from: process.env.TWILIO_FROM!, body });
      return message.sid;
    }),
  );

  return NextResponse.json({ sent: results.length });
}
