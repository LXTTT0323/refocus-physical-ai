# RE:FOCUS repository instructions

## Mandatory Agent Stack workflow

For every task that reads, explains, configures, troubleshoots, or changes TiDB Agent Stack:

1. Read `.agents/skills/agent-stack-developer/SKILL.md` before acting.
2. Follow the routing in that file and read every relevant referenced workflow.
3. Verify exact methods, paths, authentication, headers, schemas, success signals, and documented errors in `.agents/skills/agent-stack-developer/references/openapi.yaml` before writing requests or code.
4. Use raw HTTP or the repository's existing HTTP client; do not invent an SDK.
5. Keep `AGENT_STACK_USER_API_KEY` and `AGENT_STACK_WORKSPACE_API_KEY` only in environment variables or an approved secret manager. Never print, log, commit, screenshot, or place them in firmware or frontend assets.
6. Parse Turn responses as NDJSON, one non-empty line at a time. A text call is successful only after both an `assistant_message` and a terminal `turn_finished` event with `payload.status == "succeeded"` are observed.
7. Do not blindly replay an interrupted Turn. Inspect Session/Turn history first.
8. Before any live create, update, install, publish, enable, credential, schedule, activation, or delete operation, confirm that the user has explicitly authorized that side effect.
9. Treat `.agents/skills/agent-stack-developer` as a developer instruction set. Do not install it on the product Agent.

## Product Agent boundary

The product Agent is `flow-coordinator`. Its product Skills are separate packages:

- `task-setup`
- `context-relevance`
- `session-summary`

Each product Skill must have a narrow responsibility, a versioned package, documented input/output, fixed JSON output that can be validated deterministically, and an explicit test before installation on `flow-coordinator`.

