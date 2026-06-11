# Research Rigor — techniques from open-source deep-research systems

Borrowed from gpt-researcher, Stanford STORM, LangChain open_deep_research, and local-deep-researcher. These make research both deeper and more honest.

## 1. Write a research brief before searching
Convert the request into one concrete brief that states what's known, the constraints, and explicitly marks unstated dimensions as open (don't invent assumptions). Search the brief, not the raw chat. (open_deep_research `transform_messages_into_research_topic`.)

## 2. Query expansion with self-documenting sub-questions
For each sub-question, capture not just the query string but its **research goal** and **likely next directions** ("once results return, pursue X"). Inject the current date so queries are recency-aware. Generate N queries per scoped question. (dzhng/deep-research; gpt-researcher.)

## 3. Perspective-guided breadth (for ambiguous/multi-stakeholder topics)
Enumerate 2–4 relevant perspectives/personas and ask questions from each, rather than flat expansion — this surfaces angles a single viewpoint misses. (STORM.)

## 4. The reflection / gap-fill loop (make it a required step)
After each research pass, explicitly answer: **"What did I find? What's missing? Do I have enough?"** Then either generate a gap-targeting query or stop. Treat this as a first-class step, not optional advice. (local-deep-researcher; open_deep_research's required `think_tool`.)

## 5. Stop / saturation conditions (prevents shallow AND runaway research)
Stop a stream when ANY holds: you can answer the question; you have **3+ corroborating sources**; or the **last two searches returned redundant information**. Budget by complexity: simple questions 2–3 searches, complex up to ~5; cap total iterations. (open_deep_research Hard Limits.)

## 6. Source credibility scoring (a tiering pass)
Score each source on **Relevance, Credibility, Currency, Objectivity, and Quantitative value** (uprank sources carrying stats/numbers/primary data). Keep/drop on that basis; don't rewrite or summarize sources away. (gpt-researcher `curate_sources`.) Pair with `source-tiering.md`.

## 7. Primary-over-secondary hierarchy
Prefer official/primary sites and original studies over aggregators, SEO blogs, and survey re-summaries. For a person, prefer their site/LinkedIn. Prefer newer sources **only when otherwise trustworthy** (don't elevate fresh-but-junk over older authoritative). (open_deep_research; gpt-researcher.)

## 8. Self-contained sub-agent briefs + verbatim return
When delegating parallel streams: each brief must be **fully standalone** (the worker can't see other workers; spell everything out, no acronyms). Workers must return findings **verbatim with inline citations and a complete source list** — never summarize away attribution, because the merger can't recover dropped sources. Cap concurrent workers (~5) and bias toward fewer, well-scoped agents. (open_deep_research scaling rules + compression contract.) Extends `subagent-briefs.md`.

## 9. Coverage check before synthesis
Before writing, list the sub-questions and confirm each is answered or explicitly marked "couldn't verify." Unanswered load-bearing questions = research isn't done.

## Honest caveats
Open-source repo stars/recency drift; verify current state. These are technique patterns, not guarantees — the point is rigor and grounding, not a specific tool.
