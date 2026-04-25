import { spawn } from "node:child_process";
import { Readable, Writable } from "node:stream";
import * as acp from "@agentclientprotocol/sdk";
import type { PermissionResponseOutcome, SessionRoute, ThreadBackend } from "../core/types.js";
import type {
  AcpManagerDeps,
  PendingPermissionRequest,
  RuntimeState,
} from "./contracts.js";
import { PERMISSION_REQUEST_TIMEOUT_MS } from "./contracts.js";
import { extractSessionId, isAuthRequiredError } from "./utils.js";

export class AcpManager {
  private readonly useShell = process.platform === "win32";
  private readonly runtimes = new Map<ThreadBackend, RuntimeState>();
  private readonly pendingPermissionRequests = new Map<string, PendingPermissionRequest>();
  private readonly promptQueueByThread = new Map<string, Promise<void>>();
  private readonly deps: AcpManagerDeps;

  constructor(deps: AcpManagerDeps) {
    this.deps = deps;
  }

  private key(backend: ThreadBackend, spaceSlug: string, threadId: string): string {
    return `${backend}::${spaceSlug}::${threadId}`;
  }

  private parseKey(threadKey: string): { backend: ThreadBackend; route: SessionRoute } {
    const [backend, spaceSlug, threadId] = threadKey.split("::");
    return {
      backend: backend as ThreadBackend,
      route: { spaceSlug, threadId }
    };
  }

  private getRuntime(backend: ThreadBackend): RuntimeState {
    const existing = this.runtimes.get(backend);
    if (existing) return existing;

    const runtime: RuntimeState = {
      backend,
      process: null,
      connection: null,
      initialized: false,
      authenticated: false,
      runtimeGeneration: 0,
      bootstrapPromise: null,
      threadToSession: new Map(),
      sessionToThread: new Map(),
      loadedSessionByThread: new Map()
    };
    this.runtimes.set(backend, runtime);
    return runtime;
  }

  private commandForBackend(backend: ThreadBackend): { command: string; args: string[] } {
    if (backend === "opencode") {
      return {
        command: process.env.ACP_OPENCODE_BIN || "opencode",
        args: ["acp"]
      };
    }
    return {
      command: process.env.ACP_CURSOR_BIN || process.env.ACP_AGENT_BIN || "agent",
      args: ["acp"]
    };
  }

  private isRuntimeAlive(runtime: RuntimeState): boolean {
    return Boolean(runtime.process && runtime.connection && runtime.process.exitCode === null);
  }

  private connectionOrThrow(backend: ThreadBackend): acp.ClientSideConnection {
    const runtime = this.getRuntime(backend);
    if (!runtime.connection) {
      throw new Error(`ACP runtime unavailable for backend: ${backend}`);
    }
    return runtime.connection;
  }

  private clearSessionBindings(runtime: RuntimeState) {
    runtime.threadToSession.clear();
    runtime.sessionToThread.clear();
    runtime.loadedSessionByThread.clear();
  }

  private resolveRouteBySession(backend: ThreadBackend, sessionId: string): SessionRoute | undefined {
    const runtime = this.getRuntime(backend);
    const binding = runtime.sessionToThread.get(sessionId);
    if (!binding) return undefined;
    if (binding.runtimeGeneration !== runtime.runtimeGeneration) return undefined;
    return { spaceSlug: binding.spaceSlug, threadId: binding.threadId };
  }

  private bindSession(args: { backend: ThreadBackend; route: SessionRoute; sessionId: string }) {
    const runtime = this.getRuntime(args.backend);
    const threadKey = this.key(args.backend, args.route.spaceSlug, args.route.threadId);
    const oldSessionForThread = runtime.threadToSession.get(threadKey);
    if (oldSessionForThread && oldSessionForThread !== args.sessionId) {
      runtime.sessionToThread.delete(oldSessionForThread);
    }

    const oldThreadForSession = runtime.sessionToThread.get(args.sessionId);
    if (oldThreadForSession) {
      runtime.threadToSession.delete(this.key(args.backend, oldThreadForSession.spaceSlug, oldThreadForSession.threadId));
    }

    runtime.threadToSession.set(threadKey, args.sessionId);
    runtime.sessionToThread.set(args.sessionId, {
      backend: args.backend,
      ...args.route,
      runtimeGeneration: runtime.runtimeGeneration
    });
  }

  private emitRuntimeErrorToAllThreads(runtime: RuntimeState, source: string, data: unknown) {
    for (const threadKey of runtime.threadToSession.keys()) {
      const parsed = this.parseKey(threadKey);
      this.deps.emitAcpEvent(parsed.route.spaceSlug, parsed.route.threadId, "error", "rpc_error", { source, data, backend: runtime.backend });
    }
  }

  private completePendingPermissionRequest(
    requestId: string,
    outcome: PermissionResponseOutcome,
    reason: "ui_response" | "timeout" | "connection_disposed"
  ): boolean {
    const pending = this.pendingPermissionRequests.get(requestId);
    if (!pending) return false;

    clearTimeout(pending.timeoutHandle);
    this.pendingPermissionRequests.delete(requestId);

    this.deps.addLog({
      scope: "acp",
      level: reason === "timeout" ? "warn" : "info",
      message: "ACP permission request resolved",
      data: {
        requestId,
        backend: pending.backend,
        reason,
        outcome,
        spaceSlug: pending.spaceSlug,
        threadId: pending.threadId,
        sessionId: pending.sessionId
      }
    });

    pending.resolve({ outcome });
    return true;
  }

  private clearPendingPermissionRequestsForThread(backend: ThreadBackend, spaceSlug: string, threadId: string) {
    for (const [requestId, pending] of this.pendingPermissionRequests.entries()) {
      if (pending.backend !== backend) continue;
      if (pending.spaceSlug !== spaceSlug || pending.threadId !== threadId) continue;
      this.completePendingPermissionRequest(requestId, { outcome: "cancelled" }, "connection_disposed");
    }
  }

  private clearAllPendingPermissionRequestsForBackend(backend: ThreadBackend) {
    for (const [requestId, pending] of this.pendingPermissionRequests.entries()) {
      if (pending.backend !== backend) continue;
      this.completePendingPermissionRequest(requestId, { outcome: "cancelled" }, "connection_disposed");
    }
  }

  private pickAuthMethodId(backend: ThreadBackend, authMethods: Array<{ id?: string; methodId?: string; name?: string }>): string | undefined {
    const ids = authMethods
      .map((m) => (typeof m.id === "string" ? m.id : typeof m.methodId === "string" ? m.methodId : undefined))
      .filter((v): v is string => Boolean(v));
    if (!ids.length) return undefined;

    if (backend === "cursor") {
      return ids.find((id) => id === "cursor_login") ?? ids.find((id) => id.toLowerCase().includes("cursor")) ?? ids[0];
    }

    return (
      ids.find((id) => id === "opencode-login") ??
      ids.find((id) => id.toLowerCase().includes("opencode")) ??
      ids.find((id) => id.toLowerCase().includes("login")) ??
      ids[0]
    );
  }

  private spawnRuntime(backend: ThreadBackend, cwd: string, lifecycleRoute: SessionRoute) {
    const runtime = this.getRuntime(backend);
    runtime.runtimeGeneration += 1;
    this.clearSessionBindings(runtime);

    const cmd = this.commandForBackend(backend);
    runtime.process = spawn(cmd.command, cmd.args, {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      shell: this.useShell
    });

    this.deps.emitAcpEvent(lifecycleRoute.spaceSlug, lifecycleRoute.threadId, "lifecycle", "process_spawned", {
      cwd,
      backend,
      command: cmd.command,
      args: cmd.args
    });
    this.deps.addLog({
      scope: "acp",
      level: "info",
      message: "ACP process spawn attempted",
      data: {
        backend,
        command: `${cmd.command} ${cmd.args.join(" ")}`,
        useShell: this.useShell,
        cwd,
        platform: process.platform
      }
    });

    const clientImpl: acp.Client = {
      requestPermission: async (params) => {
        const sessionId = extractSessionId(params);
        const route = sessionId ? this.resolveRouteBySession(backend, sessionId) : undefined;
        if (!sessionId || !route) {
          this.deps.addLog({
            scope: "acp",
            level: "warn",
            message: "Dropping ACP permission request with unknown session routing",
            data: { backend, sessionId, params }
          });
          return { outcome: { outcome: "cancelled" } };
        }

        const requestId = crypto.randomUUID();
        this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "permission", "permission_request", { requestId, ...params }, sessionId);
        return new Promise((resolve) => {
          const timeoutHandle = setTimeout(() => {
            this.completePendingPermissionRequest(requestId, { outcome: "cancelled" }, "timeout");
          }, PERMISSION_REQUEST_TIMEOUT_MS);

          this.pendingPermissionRequests.set(requestId, {
            requestId,
            backend,
            spaceSlug: route.spaceSlug,
            threadId: route.threadId,
            sessionId,
            options: (params.options ?? []) as Array<{ optionId?: string; kind?: string; name?: string }>,
            resolve,
            timeoutHandle
          });
        });
      },
      sessionUpdate: async (params) => {
        const sessionId = (params as any)?.sessionId as string | undefined;
        const update = (params as any)?.update ?? {};
        const route = sessionId ? this.resolveRouteBySession(backend, sessionId) : undefined;

        if (!sessionId || !route) {
          this.deps.addLog({
            scope: "acp",
            level: "warn",
            message: "Dropping ACP session update for unknown session",
            data: { backend, sessionId, update }
          });
          return;
        }

        const kind = update?.sessionUpdate as string | undefined;
        switch (kind) {
          case "user_message_chunk":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "stream", "user_message_chunk", update, sessionId);
            return;
          case "agent_message_chunk":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "stream", "agent_message_chunk", update, sessionId);
            return;
          case "agent_thought_chunk":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "stream", "agent_thought_chunk", update, sessionId);
            return;
          case "tool_call":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "tool", "tool_call", update, sessionId);
            return;
          case "tool_call_update": {
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "tool", "tool_call_update", update, sessionId);
            const content = Array.isArray(update.content) ? update.content : [];
            for (const item of content) {
              this.deps.emitAcpEvent(
                route.spaceSlug,
                route.threadId,
                "tool",
                "tool_call_content",
                {
                  toolCallId: update.toolCallId,
                  itemType: item?.type,
                  item
                },
                sessionId
              );
            }
            return;
          }
          case "plan":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "session", "plan_update", update, sessionId);
            return;
          case "available_commands_update":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "session", "available_commands_update", update, sessionId);
            return;
          case "current_mode_update":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "session", "current_mode_update", update, sessionId);
            return;
          case "config_option_update":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "session", "config_option_update", update, sessionId);
            return;
          case "session_info_update": {
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "session", "session_info_update", update, sessionId);
            const title = typeof update.title === "string" ? update.title.trim() : "";
            if (title) {
              this.deps.onSessionTitleUpdated(route, title);
            }
            return;
          }
          case "usage_update":
            this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "session", "usage_update", update, sessionId);
            return;
          default:
            this.deps.emitAcpEvent(
              route.spaceSlug,
              route.threadId,
              "error",
              "rpc_error",
              {
                source: "session/update",
                reason: "unknown_session_update",
                update,
                backend
              },
              sessionId
            );
            return;
        }
      },
      extMethod: async (method, params) => {
        const sessionId = extractSessionId(params);
        const route = sessionId ? this.resolveRouteBySession(backend, sessionId) : undefined;
        if (route) {
          this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "extension", "extension_request", { method, params }, sessionId);
        }
        if (method === "cursor/ask_question") {
          return { outcome: { outcome: "skipped", reason: "No UI handler registered yet" } };
        }
        if (method === "cursor/create_plan") {
          return { outcome: { outcome: "cancelled" } };
        }
        return { outcome: { outcome: "cancelled" } };
      },
      extNotification: async (method, params) => {
        const sessionId = extractSessionId(params);
        const route = sessionId ? this.resolveRouteBySession(backend, sessionId) : undefined;
        if (!route) return;
        this.deps.emitAcpEvent(route.spaceSlug, route.threadId, "extension", "extension_notification", { method, params }, sessionId);
      }
    };

    const stream = acp.ndJsonStream(Writable.toWeb(runtime.process.stdin), Readable.toWeb(runtime.process.stdout));
    runtime.connection = new acp.ClientSideConnection(() => clientImpl, stream);
    runtime.initialized = false;
    runtime.authenticated = false;

    runtime.process.stderr.on("data", (data) => {
      this.deps.addLog({ scope: "acp", level: "warn", message: "ACP stderr output", data: { backend, text: String(data) } });
    });
    runtime.process.on("error", (error) => {
      this.emitRuntimeErrorToAllThreads(runtime, "process", { error: error.message });
    });
    runtime.process.on("close", (code, signal) => {
      this.emitRuntimeErrorToAllThreads(runtime, "close", { code, signal });
    });
    runtime.process.on("exit", (code, signal) => {
      this.emitRuntimeErrorToAllThreads(runtime, "exit", { code, signal });
      this.clearAllPendingPermissionRequestsForBackend(backend);
      runtime.connection = null;
      runtime.process = null;
      runtime.initialized = false;
      runtime.authenticated = false;
      runtime.bootstrapPromise = null;
      this.clearSessionBindings(runtime);
    });
  }

  async ensureReady(args: { backend: ThreadBackend; cwd: string; route: SessionRoute }) {
    const runtime = this.getRuntime(args.backend);
    if (!this.isRuntimeAlive(runtime)) {
      this.spawnRuntime(args.backend, args.cwd, args.route);
    }

    if (runtime.initialized && runtime.authenticated) return;
    if (runtime.bootstrapPromise) {
      await runtime.bootstrapPromise;
      return;
    }

    runtime.bootstrapPromise = (async () => {
      const conn = this.connectionOrThrow(args.backend);
      let initializeResponse: any = null;
      if (!runtime.initialized) {
        initializeResponse = (await conn.initialize({
          protocolVersion: acp.PROTOCOL_VERSION,
          clientCapabilities: {
            fs: { readTextFile: false, writeTextFile: false },
            terminal: false
          },
          clientInfo: {
            name: "basis",
            version: "0.1.0"
          }
        })) as any;
        runtime.initialized = true;
        this.deps.emitAcpEvent(args.route.spaceSlug, args.route.threadId, "lifecycle", "initialized", {
          backend: args.backend,
          agentInfo: initializeResponse?.agentInfo,
          authMethods: initializeResponse?.authMethods
        });
      }

      if (!runtime.authenticated) {
        const authMethods = Array.isArray(initializeResponse?.authMethods)
          ? initializeResponse.authMethods
          : [];
        const methodId = this.pickAuthMethodId(args.backend, authMethods);
        if (!methodId) {
          runtime.authenticated = true;
          return;
        }

        try {
          await conn.authenticate({ methodId });
          runtime.authenticated = true;
          this.deps.emitAcpEvent(args.route.spaceSlug, args.route.threadId, "lifecycle", "authenticated", {
            backend: args.backend,
            methodId
          });
        } catch (error) {
          if (args.backend === "opencode") {
            // OpenCode may reject authenticate while still allowing session/new to surface auth_required.
            this.deps.addLog({
              scope: "acp",
              level: "warn",
              message: "ACP authenticate failed for OpenCode; deferring to session/new",
              data: { methodId, reason: error instanceof Error ? error.message : String(error) }
            });
            runtime.authenticated = true;
            return;
          }
          throw error;
        }
      }
    })();

    try {
      await runtime.bootstrapPromise;
    } finally {
      runtime.bootstrapPromise = null;
    }
  }

  async ensureThreadSession(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    existingSessionId?: string;
  }): Promise<{
    sessionId: string;
    state: "created" | "loaded" | "reused";
    initialState?: {
      modes?: unknown;
      models?: unknown;
      configOptions?: unknown;
    };
  }> {
    const route: SessionRoute = { spaceSlug: args.spaceSlug, threadId: args.threadId };
    await this.ensureReady({ backend: args.backend, cwd: args.cwd, route });

    const runtime = this.getRuntime(args.backend);
    const threadKey = this.key(args.backend, route.spaceSlug, route.threadId);
    const activeSessionId = runtime.threadToSession.get(threadKey);
    if (activeSessionId) {
      const binding = runtime.sessionToThread.get(activeSessionId);
      if (binding && binding.runtimeGeneration === runtime.runtimeGeneration) {
        return { sessionId: activeSessionId, state: "reused" };
      }
      runtime.threadToSession.delete(threadKey);
    }

    if (args.existingSessionId) {
      const loaded = runtime.loadedSessionByThread.get(threadKey);
      const loadedInCurrentRuntime = loaded && loaded.runtimeGeneration === runtime.runtimeGeneration && loaded.sessionId === args.existingSessionId;

      if (!loadedInCurrentRuntime) {
        try {
          const loadedResponse = (await this.connectionOrThrow(args.backend).loadSession({
            sessionId: args.existingSessionId,
            mcpServers: []
          })) as any;
          runtime.loadedSessionByThread.set(threadKey, {
            sessionId: args.existingSessionId,
            runtimeGeneration: runtime.runtimeGeneration
          });
          this.bindSession({ backend: args.backend, route, sessionId: args.existingSessionId });
          this.deps.addLog({
            scope: "acp",
            level: "info",
            message: "Loaded existing ACP session",
            data: { ...route, backend: args.backend, sessionId: args.existingSessionId }
          });
          return {
            sessionId: args.existingSessionId,
            state: "loaded",
            initialState: {
              modes: loadedResponse?.modes,
              models: loadedResponse?.models,
              configOptions: loadedResponse?.configOptions
            }
          };
        } catch (error) {
          this.deps.addLog({
            scope: "acp",
            level: "warn",
            message: "Stored ACP session could not be loaded; creating a new session",
            data: {
              ...route,
              backend: args.backend,
              staleSessionId: args.existingSessionId,
              reason: error instanceof Error ? error.message : String(error)
            }
          });
        }
      } else {
        this.bindSession({ backend: args.backend, route, sessionId: args.existingSessionId });
        return { sessionId: args.existingSessionId, state: "reused" };
      }
    }

    try {
      const created = (await this.connectionOrThrow(args.backend).newSession({
        cwd: args.cwd,
        mcpServers: []
      })) as any;
      const sessionId = created?.sessionId as string | undefined;
      if (!sessionId) throw new Error("ACP did not return sessionId for session/new");
      this.bindSession({ backend: args.backend, route, sessionId });
      this.deps.addLog({
        scope: "acp",
        level: "info",
        message: "Created new ACP session",
        data: { ...route, backend: args.backend, sessionId }
      });
      return {
        sessionId,
        state: "created",
        initialState: {
          modes: created?.modes,
          models: created?.models,
          configOptions: created?.configOptions
        }
      };
    } catch (error) {
      if (args.backend === "opencode" && isAuthRequiredError(error)) {
        throw new Error("OpenCode authentication is required. Run `opencode auth login` and retry.");
      }
      throw error;
    }
  }

  async sendPrompt(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    sessionId: string;
    prompt: string;
  }) {
    const route: SessionRoute = { spaceSlug: args.spaceSlug, threadId: args.threadId };
    await this.ensureReady({ backend: args.backend, cwd: args.cwd, route });
    this.deps.emitAcpEvent(args.spaceSlug, args.threadId, "lifecycle", "prompt_started", { prompt: args.prompt, backend: args.backend }, args.sessionId);
    try {
      const result = await this.connectionOrThrow(args.backend).prompt({
        sessionId: args.sessionId,
        prompt: [{ type: "text", text: args.prompt }]
      });
      this.deps.emitAcpEvent(args.spaceSlug, args.threadId, "lifecycle", "prompt_completed", { result, backend: args.backend }, args.sessionId);
    } catch (error) {
      this.deps.emitAcpEvent(
        args.spaceSlug,
        args.threadId,
        "error",
        "rpc_error",
        {
          source: "prompt",
          message: error instanceof Error ? error.message : String(error),
          backend: args.backend
        },
        args.sessionId
      );
      throw error;
    }
  }

  async setSessionMode(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    sessionId: string;
    modeId: string;
  }) {
    const route: SessionRoute = { spaceSlug: args.spaceSlug, threadId: args.threadId };
    await this.ensureReady({ backend: args.backend, cwd: args.cwd, route });
    try {
      await this.connectionOrThrow(args.backend).setSessionMode({
        sessionId: args.sessionId,
        modeId: args.modeId
      });
    } catch (error) {
      this.deps.emitAcpEvent(
        args.spaceSlug,
        args.threadId,
        "error",
        "rpc_error",
        {
          source: "session/set_mode",
          message: error instanceof Error ? error.message : String(error),
          modeId: args.modeId,
          backend: args.backend
        },
        args.sessionId
      );
      throw error;
    }
  }

  async setSessionModel(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    sessionId: string;
    modelId: string;
  }) {
    const route: SessionRoute = { spaceSlug: args.spaceSlug, threadId: args.threadId };
    await this.ensureReady({ backend: args.backend, cwd: args.cwd, route });
    const conn = this.connectionOrThrow(args.backend);
    if (typeof conn.unstable_setSessionModel !== "function") {
      throw new Error("ACP runtime does not support setting session model");
    }

    try {
      await conn.unstable_setSessionModel({
        sessionId: args.sessionId,
        modelId: args.modelId
      });
    } catch (error) {
      this.deps.emitAcpEvent(
        args.spaceSlug,
        args.threadId,
        "error",
        "rpc_error",
        {
          source: "session/set_model",
          message: error instanceof Error ? error.message : String(error),
          modelId: args.modelId,
          backend: args.backend
        },
        args.sessionId
      );
      throw error;
    }
  }

  async setSessionConfigOption(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    sessionId: string;
    configId: string;
    value?: string;
    booleanValue?: boolean;
  }) {
    const route: SessionRoute = { spaceSlug: args.spaceSlug, threadId: args.threadId };
    await this.ensureReady({ backend: args.backend, cwd: args.cwd, route });

    try {
      const params =
        typeof args.booleanValue === "boolean"
          ? { sessionId: args.sessionId, configId: args.configId, type: "boolean" as const, value: args.booleanValue }
          : typeof args.value === "string"
            ? { sessionId: args.sessionId, configId: args.configId, value: args.value }
            : null;
      if (!params) {
        throw new Error("Session config option update requires either string value or booleanValue");
      }
      const response = await this.connectionOrThrow(args.backend).setSessionConfigOption(params);
      this.deps.emitAcpEvent(
        args.spaceSlug,
        args.threadId,
        "session",
        "config_option_update",
        {
          sessionUpdate: "config_option_update",
          configOptions: response?.configOptions ?? []
        },
        args.sessionId
      );
    } catch (error) {
      this.deps.emitAcpEvent(
        args.spaceSlug,
        args.threadId,
        "error",
        "rpc_error",
        {
          source: "session/set_config_option",
          message: error instanceof Error ? error.message : String(error),
          configId: args.configId,
          backend: args.backend
        },
        args.sessionId
      );
      throw error;
    }
  }

  async sendPromptQueued(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    sessionId: string;
    prompt: string;
  }) {
    const threadKey = this.key(args.backend, args.spaceSlug, args.threadId);
    const previous = this.promptQueueByThread.get(threadKey) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(() => this.sendPrompt(args));

    this.promptQueueByThread.set(
      threadKey,
      run.finally(() => {
        if (this.promptQueueByThread.get(threadKey) === run) {
          this.promptQueueByThread.delete(threadKey);
        }
      })
    );

    return run;
  }

  async cancelPrompt(args: {
    backend: ThreadBackend;
    spaceSlug: string;
    threadId: string;
    cwd: string;
    sessionId: string;
  }) {
    const route: SessionRoute = { spaceSlug: args.spaceSlug, threadId: args.threadId };
    await this.ensureReady({ backend: args.backend, cwd: args.cwd, route });

    // ACP requires clients to settle pending permission requests as cancelled on turn cancellation.
    this.clearPendingPermissionRequestsForThread(args.backend, args.spaceSlug, args.threadId);

    try {
      await this.connectionOrThrow(args.backend).cancel({ sessionId: args.sessionId });
    } catch (error) {
      this.deps.emitAcpEvent(
        args.spaceSlug,
        args.threadId,
        "error",
        "rpc_error",
        {
          source: "session/cancel",
          message: error instanceof Error ? error.message : String(error),
          backend: args.backend
        },
        args.sessionId
      );
      throw error;
    }
  }

  respondPermission(args: { requestId: string; outcome: PermissionResponseOutcome }) {
    const pending = this.pendingPermissionRequests.get(args.requestId);
    if (!pending) {
      throw new Error("Permission request not found or already resolved");
    }

    if (args.outcome.outcome === "selected") {
      const optionId = args.outcome.optionId;
      if (!optionId) {
        throw new Error("Selected outcome requires optionId");
      }
      const matched = pending.options.some((opt) => opt.optionId === optionId);
      if (!matched) {
        throw new Error(`Invalid permission optionId: ${optionId}`);
      }
      this.completePendingPermissionRequest(args.requestId, { outcome: "selected", optionId }, "ui_response");
      return true;
    }

    this.completePendingPermissionRequest(args.requestId, { outcome: "cancelled" }, "ui_response");
    return true;
  }

  disposeAll() {
    for (const runtime of this.runtimes.values()) {
      for (const threadKey of runtime.threadToSession.keys()) {
        const parsed = this.parseKey(threadKey);
        this.clearPendingPermissionRequestsForThread(runtime.backend, parsed.route.spaceSlug, parsed.route.threadId);
      }
      this.clearAllPendingPermissionRequestsForBackend(runtime.backend);
      if (runtime.process && runtime.process.exitCode === null) {
        runtime.process.kill();
      }
      runtime.connection = null;
      runtime.process = null;
      runtime.initialized = false;
      runtime.authenticated = false;
      runtime.bootstrapPromise = null;
      this.clearSessionBindings(runtime);
    }

    this.promptQueueByThread.clear();
  }
}
