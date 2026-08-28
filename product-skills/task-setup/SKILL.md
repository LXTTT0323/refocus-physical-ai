---
name: task-setup
description: Normalize a user's stated focus objective into a compact, testable task contract when starting or revising a RE:FOCUS work session. Do not use for live page relevance decisions or end-of-session summaries.
---

# Task Setup

Turn the user's own objective into one machine-readable task contract for the RE:FOCUS coordinator.

## Preserve intent

- Keep the user's goal, scope, language, and constraints. Do not broaden the assignment.
- Convert vague aspirations into an observable deliverable only when the intended result is clear.
- Do not invent deadlines, applications, websites, medical conditions, or productivity judgments.
- If the request is too vague to identify an observable result, ask exactly one useful question through the JSON contract.

## Produce the contract

Read [references/task-contract.schema.json](references/task-contract.schema.json) before responding. Return exactly one JSON object that conforms to it. Do not wrap it in Markdown and do not add commentary.

For `status: "ready"`:

- Write `goal` as one concise action.
- Write `deliverable` as the observable result that marks completion.
- Give one to three measurable `success_criteria`.
- Preserve an explicitly stated focus duration; otherwise use `null`.
- Add only specific relevance hints supported by the request. Empty arrays are valid.
- Set `clarification_question` to `null`.

For `status: "needs_clarification"`:

- Use `null` for a goal or deliverable that cannot be determined safely.
- Keep unsupported criteria and relevance hints empty.
- Ask one short question whose answer would make the task testable.

Never create task IDs or timestamps; the deterministic Bridge owns those fields.
