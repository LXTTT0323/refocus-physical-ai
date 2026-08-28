const baseUrl = process.env.AGENT_STACK_BASE_URL?.replace(/\/$/, "");
const apiKey = process.env.AGENT_STACK_USER_API_KEY;

if (!baseUrl || !apiKey) {
  throw new Error(
    "Missing AGENT_STACK_BASE_URL or AGENT_STACK_USER_API_KEY environment variable.",
  );
}

const authHeaders = {
  Authorization: `Bearer ${apiKey}`,
};

async function requestJson(path, options = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...options,
    headers: {
      ...authHeaders,
      ...options.headers,
    },
  });

  const text = await response.text();
  let body;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { message: text };
  }

  if (!response.ok) {
    const code = body?.error?.code ?? "unknown_error";
    const message = body?.error?.message ?? body?.message ?? response.statusText;
    throw new Error(`${response.status} ${code}: ${message}`);
  }

  return body;
}

const projectsResult = await requestJson("/api/console/projects");
const projects = projectsResult.projects ?? [];
const requestedProjectId = process.env.AGENT_STACK_PROJECT_ID;
const project = requestedProjectId
  ? projects.find(({ projectId }) => projectId === requestedProjectId)
  : projects.find(({ status }) => status === "active") ?? projects[0];

if (!project) {
  throw new Error("No accessible Agent Stack Project was returned.");
}

const agentsResult = await requestJson("/api/agents");
const agents = agentsResult.agents ?? [];
const requestedAgentId = process.env.AGENT_STACK_AGENT_ID;
const agent = requestedAgentId
  ? agents.find(({ agentId }) => agentId === requestedAgentId)
  : agents.find(({ name }) => name === "refocus-agent") ??
    agents.find(({ name }) => name === "Default Agent") ??
    agents[0];

if (!agent) {
  throw new Error("No accessible Agent Stack Agent was returned.");
}

console.log(`PROJECT_SELECTED ${project.name} (${project.projectId})`);
console.log(`AGENT_SELECTED ${agent.name} (${agent.agentId})`);

const sessionResult = await requestJson("/api/sessions", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-agent9-project-id": project.projectId,
  },
  body: JSON.stringify({ agentId: agent.agentId }),
});

const sessionId = sessionResult.session?.sessionId;
if (!sessionId) {
  throw new Error("Session creation succeeded without returning session.sessionId.");
}

console.log(`SESSION_CREATED ${sessionId}`);

const turnResponse = await fetch(`${baseUrl}/api/sessions/${sessionId}/turns`, {
  method: "POST",
  headers: {
    ...authHeaders,
    "Content-Type": "application/json",
    Accept: "application/x-ndjson",
    "x-agent9-project-id": project.projectId,
  },
  body: JSON.stringify({
    input: {
      type: "text",
      text: "只回复：HELLO_REFOCUS_API_OK",
    },
  }),
});

if (turnResponse.status !== 201 || !turnResponse.body) {
  const errorText = await turnResponse.text();
  throw new Error(`Turn request failed with HTTP ${turnResponse.status}: ${errorText}`);
}

const reader = turnResponse.body.getReader();
const decoder = new TextDecoder();
let buffer = "";
let assistantMessage;
let terminalStatus;
let turnId;
let agentRunId;

function consumeLine(rawLine) {
  const line = rawLine.trim();
  if (!line) return;

  const item = JSON.parse(line);
  turnId ??= item.turnId;
  agentRunId ??= item.agentRunId;

  if (item.event === "assistant_message") {
    assistantMessage = item.payload?.text;
    console.log(`ASSISTANT_MESSAGE ${assistantMessage}`);
  } else if (item.event === "turn_finished") {
    terminalStatus = item.payload?.status;
    console.log(`TURN_FINISHED status=${terminalStatus}`);
  } else if (item.event === "turn_error") {
    console.log(
      `TURN_ERROR ${item.payload?.code ?? "unknown"}: ${item.payload?.message ?? ""}`,
    );
  } else {
    console.log(`EVENT ${item.event}`);
  }
}

while (true) {
  const { value, done } = await reader.read();
  buffer += decoder.decode(value ?? new Uint8Array(), { stream: !done });

  const lines = buffer.split(/\r?\n/);
  buffer = lines.pop() ?? "";
  for (const line of lines) consumeLine(line);

  if (done) break;
}

if (buffer.trim()) consumeLine(buffer);

console.log(`TURN_ID ${turnId ?? "missing"}`);
console.log(`AGENT_RUN_ID ${agentRunId ?? "missing"}`);

if (!assistantMessage || terminalStatus !== "succeeded") {
  throw new Error(
    `Hello World incomplete: assistant_message=${Boolean(assistantMessage)}, status=${terminalStatus ?? "missing"}`,
  );
}

console.log("API_HELLO_WORLD_OK");
