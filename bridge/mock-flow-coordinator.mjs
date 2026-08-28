export class MockFlowCoordinator {
  calls = [];

  async startSession(input) {
    this.calls.push({ operation: "startSession", input });
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
        relevance_hints: { keywords: [], apps: [], domains: [] },
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
