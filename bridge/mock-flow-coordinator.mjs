export class MockFlowCoordinator {
  calls = [];

  async startSession(input) {
    this.calls.push({ operation: "startSession", input });
    const pptTask = /ppt|powerpoint/i.test(input.goal);
    return {
      coordinator_session_id: `mock_${input.local_session_id}`,
      task_contract: {
        schema_version: "1.0",
        skill: "task-setup",
        status: "ready",
        goal: input.goal,
        deliverable: input.goal,
        success_criteria: [`完成：${input.goal}`],
        focus_minutes: input.focus_minutes,
        relevance_hints: {
          keywords: pptTask ? ["RE:FOCUS"] : [],
          apps: pptTask ? ["PowerPoint"] : [],
          domains: [],
        },
        clarification_question: null,
        confidence: 0.9,
      },
    };
  }

  async clarifyTask(input) {
    this.calls.push({ operation: "clarifyTask", input });
    return {
      schema_version: "1.0",
      skill: "task-setup",
      status: "ready",
      goal: input.answer,
      deliverable: input.answer,
      success_criteria: [`完成：${input.answer}`],
      focus_minutes: input.previous_contract.focus_minutes,
      relevance_hints: { keywords: [], apps: [], domains: [] },
      clarification_question: null,
      confidence: 0.9,
    };
  }

  async classifyContext(input) {
    this.calls.push({ operation: "classifyContext", input });
    const title = input.observation.window_title ?? "";
    const app = input.observation.active_app ?? "";
    const haystack = `${app} ${title}`.toLowerCase();
    const matchedKeywords = input.task_contract.relevance_hints.keywords.filter((value) =>
      haystack.includes(value.toLowerCase()),
    );
    const matchedApps = input.task_contract.relevance_hints.apps.filter((value) =>
      app.toLowerCase().includes(value.toLowerCase()),
    );
    const relevant = matchedKeywords.length > 0 || matchedApps.length > 0;
    return {
      schema_version: "1.0",
      skill: "context-relevance",
      classification: relevant ? "relevant" : "unknown",
      confidence: relevant ? 0.95 : 0.35,
      evidence: relevant ? ["Matched task-provided relevance hints"] : ["Insufficient metadata"],
      matched_hints: { keywords: matchedKeywords, apps: matchedApps, domains: [] },
    };
  }

  async classifyVisualContext(input, imageBytes) {
    this.calls.push({ operation: "classifyVisualContext", input, byteLength: imageBytes.length });
    return {
      schema_version: "1.0",
      skill: "context-relevance",
      classification: "relevant",
      confidence: 0.9,
      evidence: [`Mock visual observation from ${input.observation.source}`],
      matched_hints: { keywords: [], apps: [], domains: [] },
    };
  }

  async createCheckpoint(input) {
    this.calls.push({ operation: "createCheckpoint", input });
    const lastProgress = input.recent_progress.at(-1) ?? "尚未记录明确进展";
    return {
      checkpoint_id: `cp_${input.interruption_sequence}`,
      last_progress: lastProgress,
      next_action: "回到原任务窗口，继续完成当前最小步骤",
      status_line: "当前进度已保存",
    };
  }

  async createRestore(input) {
    this.calls.push({ operation: "createRestore", input });
    return {
      restore_message: `你刚才${input.checkpoint.last_progress}。下一步：${input.checkpoint.next_action}。`,
      next_action: input.checkpoint.next_action,
    };
  }

  async endSession(input) {
    this.calls.push({ operation: "endSession", input });
    return {
      summary: `目标：${input.goal}；记录了 ${input.progress_count} 次进展。`,
      completed: input.end_reason === "user_finished",
    };
  }
}
