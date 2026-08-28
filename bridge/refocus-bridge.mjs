import { RefocusStateMachine } from "./state-machine.mjs";

export class RefocusBridge {
  #machine = new RefocusStateMachine();
  #coordinator;
  #goal;
  #recentProgress = [];
  #latestComputerContext = {
    active_app: null,
    window_title: null,
  };
  #checkpoint;
  #pendingRestore;
  #coordinatorSessionId;
  #taskContract;
  #effects = [];

  constructor({ coordinator }) {
    if (!coordinator) throw new Error("coordinator is required");
    this.#coordinator = coordinator;
  }

  get state() {
    return this.#machine.state;
  }

  get checkpoint() {
    return this.#checkpoint ? structuredClone(this.#checkpoint) : undefined;
  }

  get taskContract() {
    return this.#taskContract ? structuredClone(this.#taskContract) : undefined;
  }

  get effects() {
    return structuredClone(this.#effects);
  }

  async process(event) {
    const transition = this.#machine.apply(event);
    const effects = [
      {
        type: "STATE_CHANGED",
        from: transition.from,
        to: transition.to,
        event: transition.event,
      },
    ];

    switch (event.event) {
      case "SESSION_START": {
        this.#goal = event.payload.goal;
        const result = await this.#coordinator.startSession({
          local_session_id: event.session_id,
          goal: this.#goal,
          focus_minutes: event.payload.focus_minutes,
        });
        this.#coordinatorSessionId = result.coordinator_session_id;
        this.#taskContract = result.task_contract;
        if (this.#taskContract.status === "ready") {
          this.#goal = this.#taskContract.goal;
        }
        effects.push({
          type: "COORDINATOR_SESSION_READY",
          coordinator_session_id: this.#coordinatorSessionId,
          task_contract: structuredClone(this.#taskContract),
        });
        effects.push(
          this.#taskContract.status === "ready"
            ? { type: "TASK_READY", task_contract: structuredClone(this.#taskContract) }
            : {
                type: "TASK_CLARIFICATION_REQUIRED",
                question: this.#taskContract.clarification_question,
              },
        );
        break;
      }

      case "TASK_CLARIFICATION": {
        if (!this.#taskContract || this.#taskContract.status !== "needs_clarification") {
          throw new Error("TASK_CLARIFICATION requires a pending clarification");
        }
        this.#taskContract = await this.#coordinator.clarifyTask({
          coordinator_session_id: this.#coordinatorSessionId,
          local_session_id: event.session_id,
          previous_contract: structuredClone(this.#taskContract),
          answer: event.payload.answer,
        });
        if (this.#taskContract.status === "ready") {
          this.#goal = this.#taskContract.goal;
          effects.push({ type: "TASK_READY", task_contract: structuredClone(this.#taskContract) });
        } else {
          effects.push({
            type: "TASK_CLARIFICATION_REQUIRED",
            question: this.#taskContract.clarification_question,
          });
        }
        break;
      }

      case "ACTIVITY_SAMPLE": {
        this.#latestComputerContext = {
          active_app: event.payload.computer?.active_app ?? null,
          window_title: event.payload.computer?.window_title ?? null,
        };
        break;
      }

      case "PROGRESS_UPDATE": {
        this.#recentProgress.push(event.payload.description);
        this.#recentProgress = this.#recentProgress.slice(-10);
        break;
      }

      case "INTERRUPTION_DETECTED": {
        this.#checkpoint = await this.#coordinator.createCheckpoint({
          coordinator_session_id: this.#coordinatorSessionId,
          local_session_id: event.session_id,
          goal: this.#goal,
          recent_progress: [...this.#recentProgress],
          computer_context: { ...this.#latestComputerContext },
          interruption_reason: event.payload.reason,
          interruption_duration_seconds: event.payload.duration_seconds,
          interruption_sequence: event.sequence,
        });
        effects.push({
          type: "CHECKPOINT_READY",
          checkpoint: structuredClone(this.#checkpoint),
        });
        break;
      }

      case "RETURN_DETECTED": {
        if (!this.#checkpoint) {
          throw new Error("RETURN_DETECTED requires an existing checkpoint");
        }
        this.#pendingRestore = await this.#coordinator.createRestore({
          coordinator_session_id: this.#coordinatorSessionId,
          local_session_id: event.session_id,
          goal: this.#goal,
          checkpoint: structuredClone(this.#checkpoint),
          return_context: {
            active_app: event.payload.active_app,
            window_title: event.payload.window_title,
            stable_seconds: event.payload.stable_seconds,
          },
        });
        effects.push({
          type: "RESTORE_READY",
          restore: structuredClone(this.#pendingRestore),
        });
        break;
      }

      case "SESSION_RESUMED": {
        if (!this.#pendingRestore) {
          throw new Error("SESSION_RESUMED requires a completed restore response");
        }
        effects.push({
          type: "RESUME_CONFIRMED",
          restore_message: event.payload.restore_message,
        });
        this.#pendingRestore = undefined;
        break;
      }

      case "SESSION_END_REQUESTED": {
        effects.push({
          type: "REFLECTION_REQUIRED",
          questions: [
            { id: "completion_report", text: "这次完成了什么？任务完成到什么程度？" },
            { id: "focus_experience", text: "刚才的专注感受怎么样？最顺或最卡的地方是什么？" },
          ],
          input_source: "microphone",
        });
        break;
      }

      case "SESSION_FEEDBACK_COMPLETED": {
        const summary = await this.#coordinator.endSession({
          coordinator_session_id: this.#coordinatorSessionId,
          local_session_id: event.session_id,
          goal: this.#goal,
          progress_count: this.#recentProgress.length,
          recent_progress: [...this.#recentProgress],
          checkpoint: this.#checkpoint ? structuredClone(this.#checkpoint) : null,
          user_feedback: {
            completion_report: event.payload.completion_report,
            focus_experience: event.payload.focus_experience,
          },
          end_reason: "user_finished",
        });
        effects.push({ type: "SUMMARY_READY", summary });
        break;
      }
    }

    this.#effects.push(...effects);
    return structuredClone(effects);
  }
}
