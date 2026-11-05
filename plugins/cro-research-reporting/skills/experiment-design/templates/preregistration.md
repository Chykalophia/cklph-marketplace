# Test Plan — <ID> <short name>
_Written <date>, before launch. Do not edit after launch except to add the outcome._

## Hypothesis
Because we saw **<evidence, with source and number>**, we believe **<change>** for **<audience>** will move **<primary metric>** by at least **<MDE>**.

- Evidence sources: analytics | survey/poll | reviews/tickets | user test | heuristic | benchmark
- Lever: Cost | Trust | Usability | Comprehension | Motivation
- Prior from test log (`test_log.py prior --lever <lever>`): <x%>

## Design
- Page / template / segment:
- Arms and split: control vs <variants> at <split> (`power.py` assumes equal arms; an unequal split needs more total traffic, so size the smallest arm accordingly)
- Primary metric (one):
- Guardrails and non-inferiority margins (conversion counts or mean/sd per arm, the two kinds `readout.py --guardrail` accepts):
- Quality checks: SRM (p < 0.001 fails), pre-exposure balance, A/A status of the tool
- Baseline and daily eligible visitors:
- MDE, alpha, power (from `power.py`, paste the output):
- Duration: <N days, whole weeks, min 14> | Sequential? yes/no (tool + method)
- Stop rule: fixed horizon at <date/visitors> | sequential boundary

## Decision rule
Ship only if the primary metric is significantly better, every guardrail is non-inferior, and SRM passes. Otherwise do not ship or call it inconclusive.

## Outcome (fill after)
- `readout.py` output:
- Decision and why:
- Learning:
- Logged with `test_log.py add` (id):
