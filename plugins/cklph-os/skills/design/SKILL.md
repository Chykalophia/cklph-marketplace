---
name: design
description: Cross-cutting design principles for any code (SOLID, DRY, YAGNI, composition-over-inheritance). Use when designing a new module, considering an abstraction, reviewing a structure choice, or judging whether a design smells.
---

# design — principles, not patterns

The five filters that catch the most bugs in any language or framework. These are *judgment calls* —
a clean violation now beats a wrong abstraction for years.

## SOLID
- **S — Single Responsibility.** One reason to change. If you can name two distinct kinds of edit that
  would hit this module, split it.
- **O — Open / Closed.** Extend behavior by adding code, not by editing existing code. Practical test —
  can a new variant be added without touching the original switch / if-chain?
- **L — Liskov Substitution.** A subtype must work everywhere the supertype works. If callers need to
  detect which subtype they have, the hierarchy lies.
- **I — Interface Segregation.** Many narrow interfaces beat one wide one. A consumer shouldn't depend
  on methods it doesn't call.
- **D — Dependency Inversion.** Depend on abstractions, not concretions. The high-level module
  shouldn't know which DB / queue / mailer it uses — pass it the interface.

## DRY (extract at three, not two)
Two similar lines often have *different intents that look similar today*; a premature abstraction
couples them forever. Rule of thumb — extract at the **third** repetition. Never compress by accident.

## YAGNI
**You Aren't Gonna Need It.** Don't build for a future case you've only imagined. Every speculative
abstraction is overhead now and a wrong shape later. Add when the **second concrete need** arrives.

## Composition over inheritance
A class that *has* a logger via constructor injection beats a class that *is* a logger via subclassing.
Inheritance ties identity + behavior + lifecycle together; composition lets each move independently.
Use inheritance only for genuine *is-a* relationships, never to share code.

## Judgment
Principles are **filters, not laws**. A clean violation that ships beats a doctrinaire mess that
doesn't. If a rule fights the obvious solution, name the trade-off in a comment and move on.
