// FIXTURE: availability lens, should-not-flag (PRECISION)
// Looks like the public-invite-sms fixture, but every multiplier has a bound in code:
//   - the caller must be signed in, and the limiter keys on the user id, not the IP
//   - zod caps phones at 10, the note at 280 characters, and the team name at 80
//   - a per-tenant daily SMS budget in Postgres is checked and incremented atomically before any spend
//   - only numbers already saved as contacts in the caller's tenant can be messaged
//   - the completion has max_tokens set, so output cost per unit is fixed
// Worst case per user is 10 numbers x 5 requests per hour, inside a tenant budget. No finding.
// Expected verdict: NO FINDING.
import { NextResponse } from 'next/server';
import OpenAI from 'openai';
import twilio from 'twilio';
import { Ratelimit } from '@upstash/ratelimit';
import { Redis } from '@upstash/redis';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const openai = new OpenAI();
const sms = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!);
const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(5, '1 h'),
  prefix: 'invite-sms',
});

const InviteBody = z.object({
  teamName: z.string().min(1).max(80),
  note: z.string().max(280).default(''),
  phones: z.array(z.string().regex(/^\+[1-9]\d{6,14}$/)).min(1).max(10),
});

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const { success } = await ratelimit.limit(user.id);
  if (!success) return NextResponse.json({ error: 'too many invites, try again later' }, { status: 429 });

  const parsed = InviteBody.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: 'invalid request' }, { status: 400 });
  const { teamName, note, phones } = parsed.data;

  const { data: contacts } = await supabase.from('contacts').select('phone').in('phone', phones);
  const allowed = [...new Set((contacts ?? []).map(c => c.phone))];
  if (allowed.length === 0) return NextResponse.json({ sent: 0 });

  const { data: granted, error } = await supabase.rpc('reserve_sms_budget', { p_units: allowed.length });
  if (error || !granted) return NextResponse.json({ error: 'daily SMS budget reached' }, { status: 402 });

  const completion = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    max_tokens: 60,
    messages: [
      { role: 'system', content: 'Write a friendly one-line SMS inviting someone to join a team.' },
      { role: 'user', content: `Team: ${teamName}\nPersonal note: ${note}` },
    ],
  });
  const body = completion.choices[0]?.message.content ?? `Join ${teamName}!`;

  for (const phone of allowed) {
    await sms.messages.create({ to: phone, from: process.env.TWILIO_FROM!, body });
  }
  return NextResponse.json({ sent: allowed.length });
}
