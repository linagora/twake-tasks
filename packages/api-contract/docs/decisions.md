# Decisions

Decisions taken on @twake-tasks/api-contract, oldest first. Append only: a decision that changes gets a new entry that replaces the old one and cites it. Entry format: the `twake-decisions` skill of [linagora/twake-guidelines](https://github.com/linagora/twake-guidelines/blob/main/skills/twake-decisions/SKILL.md).

Categories: UX, UI, Product, Architecture, Infra, Tech.

## 2026-11-24, [Tech] A label or section name is refused past 16 times its maximum before it is folded

- Decision: `uniqueName(max)` refuses a raw name longer than `16 * max` UTF-16 units before any folding, and a printable ASCII name skips the folding. The maximum on the folded name is unchanged.
- Decided by: agent (issue [#850](https://github.com/linagora/twake-tasks/issues/850)), to be confirmed by Khaled Ferjani
- Why: the folding ran over the whole body, up to 1 MiB, so an 800 KB label name cost about 2 ms of the main thread before it was refused.
- Scope: label and section names. A name padded past the bound with invisible characters or spaces is now refused instead of cleaned.
