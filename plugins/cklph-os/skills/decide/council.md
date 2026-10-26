# Council — four voices for a one-way door

Lazy depth for `decide`. Run only after the door filter says **one-way** and the stakes are real
(see the trigger in `SKILL.md`). One round by default.

## Why fresh subagents
You have been in the conversation. You are anchored on how the question was framed, on what the
user seems to want, and on your own earlier answers. The three outside voices are the
anti-anchoring mechanism, so they must **not** see the conversation. Each gets only the extracted
question and the minimum context. Never pass the transcript, your draft position, or the other
voices' answers.

## The voices
| Voice | Lens | Who runs it |
|---|---|---|
| **Architect** | correctness, maintainability, what this locks in for the next two years | you, in context |
| **Skeptic** | is this the right question? the simplest credible alternative; broken assumptions | fresh subagent |
| **Pragmatist** | shipping speed, user impact, cost, what actually happens on Monday | fresh subagent |
| **Critic** | downside, edge cases, the failure that makes this a bad call in six months | fresh subagent |

## Steps
1. **Extract the question.** One prompt: what are we deciding, which constraints matter, what
   counts as success. If it is still vague, ask the user one clarifying question first.
2. **Gather minimum context.** Codebase decision: the few files, numbers or issue text that change
   the answer, trimmed. Business or people decision: the facts only, no repo. Strip names that
   don't matter to the call.
3. **Write the Architect position first**, before any voice returns: your pick, the three strongest
   reasons, and the main risk of your own pick. This keeps the synthesis from mirroring the others.
4. **Launch the three voices in parallel**, each as a fresh subagent (Agent tool, a general-purpose
   agent, no conversation context). Same prompt, different role line:
   ```text
   You are the <ROLE> on a four-voice decision council. <ROLE LENS, one line>.

   Question:
   <the extracted question>

   Context:
   <only the facts that change the answer>

   Reply in under 250 words:
   1. Position (1-2 sentences)
   2. Reasoning (3 bullets)
   3. Biggest risk in your own recommendation
   4. One thing the other voices will probably miss
   No hedging.
   ```
5. **Synthesize, with guardrails.** You are both a voice and the judge, so:
   - don't dismiss an outside voice without saying why;
   - if a voice changed your pick, say so;
   - two voices against your position is a real signal, not noise;
   - always print the strongest dissent, even when you reject it;
   - if the Skeptic attacked the question itself, answer that before the verdict.
6. **Hand back to the frame.** The verdict feeds `decide`'s **Pick** and **Reversal signal** steps.
   A council without a reversal signal is still hope.

## Output (fits on a phone screen)
```markdown
## Council: <short title>
**Architect:** <position> <one-line why>
**Skeptic:** <position> <one-line why>
**Pragmatist:** <position> <one-line why>
**Critic:** <position> <one-line why>

- **Consensus:** <where they agree>
- **Strongest dissent:** <the best argument against the pick>
- **Premise check:** <did the Skeptic change the question?>
- **Pick:** <option + why>
- **Reversal signal:** I'll undo or re-evaluate if <X> by <Y>.
```

## Follow-up round
Only if the user asks. Keep the new question narrow. Give the Skeptic as little of the first round
as possible: a Skeptic who has read the verdict is no longer independent.

## Persistence
Save nothing by default. If the council changed the decision, record it where decisions live: the
repo's `STATE.md` "Recent decisions", an ADR, or the issue. Not a side file.

## Anti-patterns
- Running it on a two-way door. Just pick.
- Using it as code review (`review`) or as planning (`plan`).
- Passing the subagents the transcript, "for context." That defeats the point.
- A verdict that hides the disagreement.
