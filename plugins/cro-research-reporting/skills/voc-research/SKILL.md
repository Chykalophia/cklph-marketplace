---
name: voc-research
description: >
  Voice-of-customer and qualitative conversion research: mine reviews, tickets, chats and calls; run
  polls and surveys; code open-ended answers; plan user tests. Use when asked what customers say or
  why they don't buy, before writing hypotheses or copy.
license: MIT
metadata:
  author: Chykalophia
---

# Voice-of-Customer Research

**Trigger phrases:** "what are customers saying", "analyse these reviews", "code these survey responses", "why do people abandon", "customer objections", "survey questions", "user testing plan", "voice of customer", "VoC", "review mining". Also covers building a customer-language bank for copy.

Find out why visitors don't buy by asking and watching real customers, then turn what they say into evidence-tagged hypotheses and copy. This is the research layer the audit and the tests depend on.

## Why this skill exists (evidence)
- **AI is good at this part.** GPT-4o coded survey open-ends at kappa 0.76 against human coders zero-shot and 0.94 fine-tuned (von der Heyde et al. 2025, https://arxiv.org/pdf/2506.14634). ChatGPT beat crowd-workers on 4 of 5 annotation tasks at about 1/20 the cost (Gilardi et al., PNAS 2023, https://arxiv.org/abs/2303.15056).
- **AI is bad at replacing customers.** Synthetic users were idealised and sycophantic next to real study data (NN/g 2024, https://www.nngroup.com/articles/synthetic-users/). Synthetic survey data had half the real variance and flipped the sign on a third of the relationships that differed (Bisbee et al., Political Analysis 2024). Never substitute generated personas or "simulated customers" for this research.
- **Small qualitative samples go far.** Five users find ~85% of usability problems; three rounds of five beat one of fifteen (Nielsen, https://nngroup.com/articles/why-you-only-need-to-test-with-5-users/). CXL/Speero's ResearchXL asks for 200+ survey responses for stable proportions.

## Methods (pick by question and budget; details in `references/methods.md`)
| Question | Method | AI's job | Human's job |
|---|---|---|---|
| What stops people buying? | Exit-intent / on-page poll (1 open question) | Code and count answers | Choose the question and page |
| Why did buyers buy, and what nearly stopped them? | Post-purchase survey (5–8 questions) | Code, cluster, pull quotes | Approve survey; read a sample |
| What do customers already say unprompted? | Review, ticket, chat, return-reason mining (own + competitors) | Extract, code, quantify | Validate codebook on a sample |
| Where do people get stuck? | Moderated or unmoderated user test, 5 per round per segment | Draft tasks; summarise sessions | Run or watch sessions; judge severity |
| What words do they use? | Language bank from all of the above | Collect verbatim phrases by theme | Pick the ones copy will use |

## Workflow
1. **Read the brief** (`./cro-engagement.md`): the surface, the funnel step that leaks, the ICP.
2. **Start with what already exists**: reviews, tickets, return reasons, past surveys. Mining costs nothing and needs no traffic.
3. **Add the cheapest new signal** for the leaking step: a one-question poll on that page, or a post-purchase survey. Question bank in `references/methods.md`.
4. **Code with the protocol in `references/ai-coding-protocol.md`**: build a codebook from a first sample, have AI code a 50–100 item sample, have a human code the same sample, run `scripts/agreement.py`, refine until kappa ≥ 0.7, then code the full set. With under ~100 items in total, have a human review every AI code instead and call the themes exploratory. The `voc-coder` agent runs the AI half.
5. **Quantify and rank themes**: share of responses per code, split by segment (new vs returning, device, product line). Keep 2–3 verbatim quotes per theme.
6. **Turn themes into hypotheses**: each one names the theme, its share, the page element it maps to, and the lever (Cost, Trust, Usability, Comprehension, Motivation). Hand them to `ecommerce-cro-audit` for prioritisation and `experiment-design` for testing.
7. **Build the language bank** (`references/codebook-template.md` has the format) for `conversion-copywriting`.

## Engagement context
Read `./cro-engagement.md` first and add any research assets you find (review export, survey tool, ticket system) to its Data & access section.

## Related skills
`ecommerce-cro-audit` (consumes themes as evidence), `experiment-design` (tests the hypotheses), `conversion-copywriting` (uses the language bank), `report-information-design` (presents findings).

## Guardrails
- Report counts and shares with the sample size, never "customers feel" without a number.
- Keep quotes verbatim and attributable to a source type (review, survey, ticket). Don't paraphrase a quote and present it as verbatim.
- Strip personal data before sending feedback to any external tool.
- One survey answer is an anecdote; a theme needs volume or a consistent pattern across sources.
