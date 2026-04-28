import type { AcpTranslatedEvent } from "../types";

export type ComposerCommand = { name: string; description: string };

export type SelectOption = { valueId: string; label: string };

export type ModelSelectOption = SelectOption & { configId?: string };

export type SessionConfigControl =
  | {
      type: "select";
      configId?: string;
      name: string;
      category?: string;
      currentValue: string;
      options: SelectOption[];
    }
  | {
      type: "boolean";
      configId?: string;
      name: string;
      category?: string;
      currentValue: boolean;
    };

export type ModeOption = { modeId: string; label: string };

export type ModelSelectState = {
  name: string;
  currentLabel: string;
  options: ModelSelectOption[];
} | null;

export type SessionChromeState = {
  availableCommands: ComposerCommand[];
  modeOptions: ModeOption[];
  currentModeId?: string;
  modelSelect: ModelSelectState;
  configControls: SessionConfigControl[];
  usage?: { used: number; size: number; pct: number };
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (!v || typeof v !== "object") return null;
  return v as Record<string, unknown>;
}

function parseAvailableCommands(data: unknown): ComposerCommand[] {
  const d = asRecord(data);
  const raw = d?.availableCommands;
  if (!Array.isArray(raw)) return [];
  const out: ComposerCommand[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    const name = typeof r?.name === "string" ? r.name : "";
    const description = typeof r?.description === "string" ? r.description : "";
    if (!name || !description) continue;
    out.push({ name, description });
  }
  return out;
}

function parseCurrentModeId(data: unknown): string | undefined {
  const d = asRecord(data);
  const modes = asRecord(d?.modes);
  const id = modes?.currentModeId ?? d?.currentModeId;
  return typeof id === "string" ? id : undefined;
}

function parseModeOptionsFromModes(data: unknown): ModeOption[] {
  const d = asRecord(data);
  const modes = asRecord(d?.modes);
  const raw = Array.isArray(modes?.availableModes)
    ? modes?.availableModes
    : Array.isArray(d?.availableModes)
      ? d?.availableModes
      : null;
  if (!raw) return [];
  const out: ModeOption[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const modeId = typeof r.id === "string" ? r.id : "";
    const label = typeof r.name === "string" ? r.name : modeId;
    if (!modeId) continue;
    out.push({ modeId, label });
  }
  return out;
}

function parseModelSelectFromModels(data: unknown): ModelSelectState {
  const d = asRecord(data);
  const models = asRecord(d?.models);
  const currentModelId =
    typeof models?.currentModelId === "string"
      ? models.currentModelId
      : typeof d?.currentModelId === "string"
        ? d.currentModelId
        : "";
  const availableModels = Array.isArray(models?.availableModels)
    ? models.availableModels
    : Array.isArray(d?.availableModels)
      ? d.availableModels
      : null;
  if (!availableModels || !availableModels.length) return null;

  const options: ModelSelectOption[] = [];
  for (const item of availableModels) {
    const r = asRecord(item);
    if (!r) continue;
    const valueId = typeof r.modelId === "string" ? r.modelId : "";
    const label = typeof r.name === "string" ? r.name : valueId;
    if (!valueId) continue;
    options.push({ valueId, label });
  }
  if (!options.length) return null;

  const currentLabel = options.find((x) => x.valueId === currentModelId)?.label ?? (currentModelId || "Model");
  return { name: "Model", currentLabel, options };
}

function parseConfigModelSelect(data: unknown): ModelSelectState {
  const controls = parseConfigControls(data);
  const modelControl = controls.find(
    (x) =>
      x.type === "select" && (x.category === "model" || x.name.toLowerCase().includes("model"))
  );
  if (!modelControl || modelControl.type !== "select") return null;
  const options = modelControl.options.map((x) => ({ ...x, configId: modelControl.configId }));
  const currentLabel = options.find((x) => x.valueId === modelControl.currentValue)?.label ?? modelControl.currentValue;
  return {
    name: modelControl.name || "Model",
    currentLabel,
    options
  };
}

function parseSelectOptions(raw: unknown): SelectOption[] {
  if (!Array.isArray(raw)) return [];
  const out: SelectOption[] = [];
  for (const item of raw) {
    const r = asRecord(item);
    if (!r) continue;
    const nested = r.options;
    if (Array.isArray(nested)) {
      for (const n of nested) {
        const rr = asRecord(n);
        if (!rr) continue;
        const valueId = typeof rr.value === "string" ? rr.value : "";
        const label =
          typeof rr.name === "string"
            ? rr.name
            : typeof rr.title === "string"
              ? rr.title
              : valueId;
        if (!valueId) continue;
        out.push({ valueId, label });
      }
      continue;
    }
    const valueId = typeof r.value === "string" ? r.value : "";
    const label =
      typeof r.name === "string"
        ? r.name
        : typeof r.title === "string"
          ? r.title
          : valueId;
    if (!valueId) continue;
    out.push({ valueId, label });
  }
  return out;
}

function parseConfigControls(data: unknown): SessionConfigControl[] {
  const d = asRecord(data);
  const opts = d?.configOptions;
  if (!Array.isArray(opts)) return [];

  const out: SessionConfigControl[] = [];

  for (const item of opts) {
    const r = asRecord(item);
    if (!r) continue;
    const type = r.type;
    const configId = typeof r.id === "string" ? r.id : undefined;
    const name = typeof r.name === "string" ? r.name : "Option";
    const category = typeof r.category === "string" ? r.category : undefined;

    if (type === "select") {
      const currentValue = typeof r.currentValue === "string" ? r.currentValue : "";
      const options = parseSelectOptions(r.options);
      out.push({ type, configId, name, category, currentValue, options });
      continue;
    }

    if (type === "boolean") {
      const currentValue = Boolean(r.currentValue);
      out.push({ type, configId, name, category, currentValue });
    }
  }

  return out;
}

function parseModeOptions(data: unknown): ModeOption[] {
  const controls = parseConfigControls(data);
  const modeControl = controls.find(
    (x) =>
      x.type === "select" && (x.category === "mode" || x.name.toLowerCase().includes("mode"))
  );
  if (!modeControl || modeControl.type !== "select") return [];
  return modeControl.options.map((x) => ({ modeId: x.valueId, label: x.label }));
}

function parseUsage(data: unknown): SessionChromeState["usage"] {
  const d = asRecord(data);
  if (!d) return undefined;

  const pickNums = (obj: Record<string, unknown> | null) => {
    if (!obj) return undefined;
    const usedCandidates = [
      obj.used,
      obj.tokensUsed,
      obj.contextUsed,
      obj.contextTokensUsed,
      obj.promptTokensUsed
    ];
    const sizeCandidates = [
      obj.size,
      obj.tokensTotal,
      obj.contextSize,
      obj.contextTokensTotal,
      obj.promptTokensTotal,
      obj.limit
    ];
    const used = usedCandidates.find((v) => typeof v === "number") as number | undefined;
    const size = sizeCandidates.find((v) => typeof v === "number") as number | undefined;
    if (typeof used !== "number" || typeof size !== "number") return undefined;
    if (!Number.isFinite(used) || !Number.isFinite(size) || size <= 0) return undefined;
    return { used, size };
  };

  const direct = pickNums(d);
  const fromUsage = pickNums(asRecord(d.usage));
  const fromContext = pickNums(asRecord(d.context));
  const fromTokens = pickNums(asRecord(d.tokens));
  const fromMeta = pickNums(asRecord(d._meta));

  const hit = direct ?? fromUsage ?? fromContext ?? fromTokens ?? fromMeta;
  if (!hit) return undefined;
  const pct = Math.max(0, Math.min(100, (hit.used / hit.size) * 100));
  return { used: hit.used, size: hit.size, pct };
}

export function deriveSessionChromeState(events: AcpTranslatedEvent[]): SessionChromeState {
  const sorted = [...events].sort((a, b) => {
    if (a.seq !== b.seq) return a.seq - b.seq;
    const t = a.at.localeCompare(b.at);
    if (t !== 0) return t;
    return a.id.localeCompare(b.id);
  });

  let availableCommands: ComposerCommand[] = [];
  let modeOptions: ModeOption[] = [];
  let currentModeId: string | undefined;
  let modelSelect: ModelSelectState = null;
  let configControls: SessionConfigControl[] = [];
  let usage: SessionChromeState["usage"];
  let usageUpdateCount = 0;

  for (const e of sorted) {
    if (e.event === "available_commands_update") {
      availableCommands = parseAvailableCommands(e.data);
    }

    const parsedModeId = parseCurrentModeId(e.data);
    if (parsedModeId) currentModeId = parsedModeId;

    const parsedModeOptionsFromModes = parseModeOptionsFromModes(e.data);
    if (parsedModeOptionsFromModes.length) modeOptions = parsedModeOptionsFromModes;

    const parsedModelSelectFromModels = parseModelSelectFromModels(e.data);
    if (parsedModelSelectFromModels) modelSelect = parsedModelSelectFromModels;

    const parsedControls = parseConfigControls(e.data);
    if (parsedControls.length) {
      configControls = parsedControls;
      if (!modeOptions.length) modeOptions = parseModeOptions(e.data);
      if (!modelSelect) modelSelect = parseConfigModelSelect(e.data);
    }

    if (e.event === "usage_update") {
      usageUpdateCount += 1;
      usage = parseUsage(e.data);
    }
    if (e.event === "prompt_completed") {
      // no-op
    }

    const m = asRecord(asRecord(e.data)?.models);
    if (modelSelect && typeof m?.currentModelId === "string" && m.currentModelId) {
      const id = m.currentModelId;
      const match = modelSelect.options.find((o) => o.valueId === id);
      modelSelect = {
        name: modelSelect.name,
        currentLabel: match?.label ?? id,
        options: modelSelect.options
      };
    }
  }

  return { availableCommands, modeOptions, currentModeId, modelSelect, configControls, usage };
}

export function modeChipTheme(modeId: string): { label: string; className: string } {
  const id = modeId.toLowerCase();
  if (id.includes("plan")) {
    return {
      label: "Plan",
      className: "bg-amber-500/10 text-amber-500"
    };
  }
  if (id.includes("debug")) {
    return {
      label: "Debug",
      className: "bg-rose-500/10 text-rose-400"
    };
  }
  if (id.includes("ask")) {
    return {
      label: "Ask",
      className: "bg-sky-500/10 text-sky-400"
    };
  }
  if (id.includes("agent")) {
    return {
      label: "Agent",
      className: "bg-emerald-500/10 text-emerald-400"
    };
  }
  return {
    label: modeId,
    className: "bg-[#2A2A2A] text-[#A3A3A3]"
  };
}
