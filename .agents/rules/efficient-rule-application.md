---
trigger: always_on
name: efficient-rule-application
description: Applies engineering rules efficiently according to task scope and risk while avoiding duplicated analysis and unnecessary work.
---

# Efficient Rule Application

- Follow all applicable project rules.
- Scale analysis, implementation, and verification to the task's complexity and risk.
- Avoid repeating the same analysis across multiple rules.
- For minor UI or text changes, avoid unrelated audits, broad refactoring, and unnecessary full test suites.
- For security-sensitive changes, enforce relevant security checks and tests.
- For database changes, verify migration safety, data integrity, and compatibility.
- For API changes, verify affected contracts and regression risks.
- Prefer the smallest correct implementation.
- Never skip essential security controls or required verification merely to save time.
- Report meaningful changes, checks performed, failures, and remaining risks.

## Final Invariant

Apply rules efficiently without weakening security, correctness, or production safety.
