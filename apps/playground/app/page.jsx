"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  FLOW_PRESETS,
  FLOW_PRESET_MAP,
  OPERATION_LIST,
  OPERATION_MAP,
  SCENARIO_PRESETS,
  SCENARIO_PRESET_MAP,
  defaultPayloadFor
} from "@/app/lib/operations";

const DEFAULT_CONNECTION = {
  base_url: "http://127.0.0.1:3001",
  tenant_id: "default",
  scope: "default",
  api_key: "",
  bearer_token: "",
  admin_token: ""
};

const DEFAULT_SCENARIO = SCENARIO_PRESETS[0]?.key || "";
const DEFAULT_FLOW_PRESET = FLOW_PRESETS[0]?.key || "";
const LLM_CONFIG_STORAGE_KEY = "aionis_playground_llm_config_v1";
const CHAT_SESSION_STORAGE_KEY = "aionis_playground_chat_sessions_v1";
const CHAT_SESSION_ACTIVE_KEY = "aionis_playground_chat_active_session_v1";
const PLAYGROUND_SETTINGS_TAB_STORAGE_KEY = "aionis_playground_settings_tab_v1";
const PLAYGROUND_LANGUAGE_STORAGE_KEY = "aionis_playground_language_v1";
const DEFAULT_CHAT_CONFIG = {
  provider: "openai_compatible",
  base_url: "https://api.openai.com/v1",
  model: "gpt-4.1-mini",
  api_key: "",
  temperature: 0.3,
  max_tokens: 800,
  system_prompt: "You are an assistant helping validate Aionis memory and policy workflows."
};
const CHAIN_STATUS_FILTERS = [
  { key: "all", label_key: "status_all" },
  { key: "ok", label_key: "status_ok" },
  { key: "fail", label_key: "status_fail" }
];
const CHAT_PROMPT_CHIPS = [
  {
    key: "chip_memory_summary",
    en: "Summarize what you remember about this user.",
    zh: "总结你目前记住的用户信息。"
  },
  {
    key: "chip_rule_constraints",
    en: "What rule constraints should apply to this request?",
    zh: "这个请求应该应用哪些规则约束？"
  },
  {
    key: "chip_policy_action",
    en: "Give a policy-safe next action with brief rationale.",
    zh: "给出一个符合策略的下一步动作，并简述理由。"
  }
];
const SETTINGS_TABS = ["llm", "connection", "operation", "flow", "export"];

const I18N = {
  en: {
    app_name: "Aionis Playground",
    app_subtitle: "Chat + Memory Lab",
    scenario: "Scenario",
    scenario_preset: "scenario preset",
    apply_preset: "Apply preset",
    sessions: "Sessions",
    new: "New",
    delete: "Delete",
    clear_chat: "Clear chat",
    active_title: "active title",
    history: "History",
    status: "status",
    status_all: "all",
    status_ok: "ok only",
    status_fail: "failed only",
    operation: "operation",
    no_matching_requests: "No matching requests.",
    session: "Session",
    run_op: "Run op",
    run_flow: "Run flow",
    running: "Running...",
    metric_total: "Total",
    metric_ok: "OK",
    metric_fail: "Fail",
    metric_avg: "Avg",
    chat_empty_hint: "Start a conversation to test memory-grounded behavior.",
    inspector: "Inspector",
    inspector_empty: "Select one request from history.",
    request_id: "request_id",
    decision_id: "decision_id",
    run_id: "run_id",
    copy_request_id: "Copy request_id",
    copy_decision_id: "Copy decision_id",
    copy_run_id: "Copy run_id",
    request_payload: "request payload",
    response_body: "response body",
    response_diff: "response diff",
    no_previous_response: "No previous response for this operation.",
    no_structural_diff: "No structural diff detected.",
    error_prefix: "error",
    before_label: "before",
    after_label: "after",
    composer_placeholder: "Message...",
    use_recall: "use recall",
    auto_write: "auto write",
    send: "Send",
    sending: "Sending...",
    llm: "LLM",
    connection: "connection",
    flow: "flow",
    export: "export",
    provider: "provider",
    base_url: "base_url",
    model: "model",
    model_label: "model",
    tokens_label: "tokens",
    api_key: "api_key",
    hide: "Hide",
    show: "Show",
    clear: "Clear",
    test_connection: "Test connection",
    testing: "Testing...",
    temperature: "temperature",
    max_tokens: "max_tokens",
    system_prompt: "system prompt",
    tenant_id: "tenant_id",
    scope: "scope",
    x_api_key: "x-api-key",
    bearer_token: "bearer token",
    x_admin_token: "x-admin-token",
    payload_json: "payload JSON",
    reset: "Reset",
    inject_tenant_scope: "Inject tenant/scope",
    inject_runtime: "Inject runtime",
    flow_preset: "flow preset",
    flow_json: "flow JSON",
    stop_on_http: "stop on HTTP failure",
    stop_on_assert: "stop on assert failure",
    flow_report: "Flow report",
    flow_ok_label: "ok",
    flow_failed_label: "failed",
    flow_assert_failed_label: "assert failed",
    export_json: "Export JSON",
    export_md: "Export MD",
    copy_share_link: "Copy share link",
    export_session_json: "Export session JSON",
    clear_history: "Clear history",
    history_cleared: "History cleared.",
    share_link_copied: "Share link copied.",
    share_link_create_failed: "Failed to create share link.",
    share_link_copy_failed: "Copy failed.",
    share_link_loaded: "Loaded config from share link.",
    share_link_invalid: "Invalid share link payload.",
    flow_report_json_exported: "Flow report JSON exported.",
    flow_report_md_exported: "Flow report Markdown exported.",
    copy_success: "Copied {kind}.",
    copy_failed: "Copy {kind} failed.",
    chat_note_recall_injected: "Injected recall_text context into prompt.",
    chat_note_recall_failed: "recall_text failed; continue without memory context.",
    chat_note_auto_write: "Auto-wrote this turn into memory.",
    chat_error_prefix: "Chat error: ",
    llm_ok: "LLM connection OK ({model}).",
    llm_fail: "LLM test failed: {error}",
    clear_session_messages: "Cleared current session messages.",
    untitled_chat: "Untitled chat"
  },
  zh: {
    app_name: "Aionis Playground",
    app_subtitle: "对话 + 记忆实验台",
    scenario: "场景",
    scenario_preset: "场景预设",
    apply_preset: "应用预设",
    sessions: "会话",
    new: "新建",
    delete: "删除",
    clear_chat: "清空会话",
    active_title: "当前会话标题",
    history: "请求历史",
    status: "状态",
    status_all: "全部",
    status_ok: "仅成功",
    status_fail: "仅失败",
    operation: "操作",
    no_matching_requests: "当前筛选下无请求。",
    session: "会话",
    run_op: "执行操作",
    run_flow: "执行流程",
    running: "执行中...",
    metric_total: "总数",
    metric_ok: "成功",
    metric_fail: "失败",
    metric_avg: "平均",
    chat_empty_hint: "开始一段对话，验证记忆增强行为。",
    inspector: "检查器",
    inspector_empty: "请先在历史中选择一条请求。",
    request_id: "request_id",
    decision_id: "decision_id",
    run_id: "run_id",
    copy_request_id: "复制 request_id",
    copy_decision_id: "复制 decision_id",
    copy_run_id: "复制 run_id",
    request_payload: "请求载荷",
    response_body: "响应内容",
    response_diff: "响应差异",
    no_previous_response: "该操作暂无上一条响应可对比。",
    no_structural_diff: "未检测到结构性差异。",
    error_prefix: "错误",
    before_label: "变更前",
    after_label: "变更后",
    composer_placeholder: "输入消息...",
    use_recall: "使用 recall",
    auto_write: "自动写入",
    send: "发送",
    sending: "发送中...",
    llm: "模型",
    connection: "连接",
    flow: "流程",
    export: "导出",
    provider: "提供方",
    base_url: "base_url",
    model: "模型",
    model_label: "模型",
    tokens_label: "tokens",
    api_key: "api_key",
    hide: "隐藏",
    show: "显示",
    clear: "清空",
    test_connection: "连通性测试",
    testing: "测试中...",
    temperature: "温度",
    max_tokens: "最大 tokens",
    system_prompt: "系统提示词",
    tenant_id: "tenant_id",
    scope: "scope",
    x_api_key: "x-api-key",
    bearer_token: "bearer token",
    x_admin_token: "x-admin-token",
    payload_json: "payload JSON",
    reset: "重置",
    inject_tenant_scope: "注入 tenant/scope",
    inject_runtime: "注入运行时变量",
    flow_preset: "流程预设",
    flow_json: "流程 JSON",
    stop_on_http: "HTTP 失败即停止",
    stop_on_assert: "断言失败即停止",
    flow_report: "流程报告",
    flow_ok_label: "成功",
    flow_failed_label: "失败",
    flow_assert_failed_label: "断言失败",
    export_json: "导出 JSON",
    export_md: "导出 MD",
    copy_share_link: "复制分享链接",
    export_session_json: "导出会话 JSON",
    clear_history: "清空历史",
    history_cleared: "历史已清空。",
    share_link_copied: "分享链接已复制。",
    share_link_create_failed: "生成分享链接失败。",
    share_link_copy_failed: "复制失败。",
    share_link_loaded: "已从分享链接载入配置。",
    share_link_invalid: "分享链接内容无效。",
    flow_report_json_exported: "流程报告 JSON 已导出。",
    flow_report_md_exported: "流程报告 Markdown 已导出。",
    copy_success: "已复制 {kind}。",
    copy_failed: "复制 {kind} 失败。",
    chat_note_recall_injected: "已将 recall_text 结果注入到提示中。",
    chat_note_recall_failed: "recall_text 调用失败，将在无记忆上下文模式下继续。",
    chat_note_auto_write: "本轮对话已自动写入记忆。",
    chat_error_prefix: "对话错误：",
    llm_ok: "LLM 连接正常（{model}）。",
    llm_fail: "LLM 测试失败：{error}",
    clear_session_messages: "当前会话消息已清空。",
    untitled_chat: "未命名会话"
  }
};

const I18N_META = {
  zh: {
    scenarios: {
      support_triage: {
        label: "客服分诊",
        description: "客服记忆 + 策略流"
      },
      sales_followup: {
        label: "销售跟进",
        description: "线索记忆 + 下一步决策"
      },
      personal_assistant: {
        label: "个人助理",
        description: "个人记忆召回 + 工具选择"
      }
    },
    flows: {
      quick_default: {
        label: "快速默认流",
        description: "write -> recall_text -> rules -> tools_select"
      },
      policy_closed_loop: {
        label: "策略闭环流",
        description: "在选择后补充 feedback 与 decision replay"
      }
    },
    operations: {
      write: { label: "写入", description: "创建或更新记忆节点与边。" },
      recall: { label: "结构召回", description: "检索结构化记忆图上下文。" },
      recall_text: { label: "文本召回", description: "为 LLM 检索可直接拼接的文本上下文。" },
      rules_evaluate: { label: "规则评估", description: "基于当前输入执行激活规则。" },
      tools_select: { label: "工具选择", description: "在策略约束下进行工具选择。" },
      tools_feedback: { label: "反馈回写", description: "写入执行结果反馈以支持策略适配。" },
      tools_decision: { label: "决策回放", description: "回放或检查持久化决策证据。" }
    }
  }
};

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return patch;
  const next = { ...(base && typeof base === "object" && !Array.isArray(base) ? base : {}) };
  for (const [key, value] of Object.entries(patch)) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      next[key] = deepMerge(next[key], value);
    } else {
      next[key] = value;
    }
  }
  return next;
}

function interpolate(template, vars = {}) {
  return String(template || "").replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? ""));
}

function pretty(value) {
  return JSON.stringify(value, null, 2);
}

function parseJsonObject(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Payload must be a JSON object");
  }
  return parsed;
}

function applyTenantScope(payload, connection) {
  const next = deepClone(payload);
  const tenantId = String(connection.tenant_id || "").trim();
  const scope = String(connection.scope || "").trim();
  if (tenantId && !next.tenant_id) next.tenant_id = tenantId;
  if (scope && !next.scope) next.scope = scope;
  return next;
}

function findDecisionId(input) {
  const seen = new Set();
  const stack = [input];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur.decision_id === "string" && cur.decision_id.trim()) {
      return cur.decision_id.trim();
    }
    for (const value of Object.values(cur)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return "";
}

function findRunId(input) {
  const seen = new Set();
  const stack = [input];
  while (stack.length > 0) {
    const cur = stack.pop();
    if (!cur || typeof cur !== "object") continue;
    if (seen.has(cur)) continue;
    seen.add(cur);
    if (typeof cur.run_id === "string" && cur.run_id.trim()) {
      return cur.run_id.trim();
    }
    for (const value of Object.values(cur)) {
      if (value && typeof value === "object") stack.push(value);
    }
  }
  return "";
}

function maskSecret(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  if (raw.length <= 8) return "********";
  return `${raw.slice(0, 4)}...${raw.slice(-4)}`;
}

function resolveToken(token, runtimeContext, connection) {
  if (token === "now.iso") return new Date().toISOString();
  if (token === "now.unix_ms") return String(Date.now());
  if (token.startsWith("last.")) {
    return String(runtimeContext[token.slice(5)] || "");
  }
  if (token.startsWith("connection.")) {
    return String(connection[token.slice(11)] || "");
  }
  return "";
}

function applyRuntimeVars(value, runtimeContext, connection) {
  if (Array.isArray(value)) {
    return value.map((item) => applyRuntimeVars(item, runtimeContext, connection));
  }

  if (value && typeof value === "object") {
    const next = {};
    for (const [key, inner] of Object.entries(value)) {
      next[key] = applyRuntimeVars(inner, runtimeContext, connection);
    }
    return next;
  }

  if (typeof value === "string") {
    return value.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_, token) => resolveToken(String(token || "").trim(), runtimeContext, connection));
  }

  return value;
}

function normalizeStepAssert(raw, index) {
  if (raw == null) return null;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error(`flow step ${index + 1}: assert must be an object`);
  }

  const out = {};
  if (raw.expect_ok !== undefined) out.expect_ok = Boolean(raw.expect_ok);
  if (raw.require_decision_id !== undefined) out.require_decision_id = Boolean(raw.require_decision_id);
  if (raw.require_request_id !== undefined) out.require_request_id = Boolean(raw.require_request_id);
  if (raw.max_duration_ms !== undefined) {
    const n = Number(raw.max_duration_ms);
    if (!Number.isFinite(n) || n <= 0) {
      throw new Error(`flow step ${index + 1}: max_duration_ms must be > 0`);
    }
    out.max_duration_ms = Math.round(n);
  }
  if (raw.error_includes !== undefined) out.error_includes = String(raw.error_includes);

  return Object.keys(out).length > 0 ? out : null;
}

function parseFlowSteps(flowText) {
  const parsed = JSON.parse(flowText);
  if (!Array.isArray(parsed)) {
    throw new Error("Flow JSON must be an array");
  }

  return parsed.map((item, index) => {
    if (typeof item === "string") {
      if (!OPERATION_MAP[item]) {
        throw new Error(`flow step ${index + 1}: unknown operation '${item}'`);
      }
      return { operation: item, payload: null, assert: null };
    }

    if (!item || typeof item !== "object" || Array.isArray(item)) {
      throw new Error(`flow step ${index + 1}: must be string or object`);
    }

    const op = String(item.operation || "").trim();
    if (!op || !OPERATION_MAP[op]) {
      throw new Error(`flow step ${index + 1}: missing/invalid operation`);
    }

    const payload = item.payload && typeof item.payload === "object" && !Array.isArray(item.payload)
      ? deepClone(item.payload)
      : null;

    return {
      operation: op,
      payload,
      assert: normalizeStepAssert(item.assert, index)
    };
  });
}

function makeFlowTextFromPreset(flowPresetKey) {
  const preset = FLOW_PRESET_MAP[flowPresetKey];
  return preset ? pretty(preset.steps) : pretty([]);
}

function collectDiff(prev, next, path = "", out = [], depth = 0) {
  if (out.length >= 80) return out;
  if (depth > 8) return out;

  const prevIsObj = prev && typeof prev === "object";
  const nextIsObj = next && typeof next === "object";

  if (!prevIsObj || !nextIsObj) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      out.push({ path: path || "$", before: prev, after: next });
    }
    return out;
  }

  if (Array.isArray(prev) || Array.isArray(next)) {
    if (JSON.stringify(prev) !== JSON.stringify(next)) {
      out.push({ path: path || "$", before: prev, after: next });
    }
    return out;
  }

  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  for (const key of keys) {
    if (out.length >= 80) break;
    const nextPath = path ? `${path}.${key}` : key;
    collectDiff(prev[key], next[key], nextPath, out, depth + 1);
  }
  return out;
}

function evaluateStepAssert(entry, stepAssert) {
  if (!stepAssert) return { ok: true, reason: "" };

  if (stepAssert.expect_ok === true && !entry.ok) {
    return { ok: false, reason: "expected ok=true" };
  }
  if (stepAssert.expect_ok === false && entry.ok) {
    return { ok: false, reason: "expected ok=false" };
  }
  if (stepAssert.require_decision_id && !entry.decision_id) {
    return { ok: false, reason: "decision_id is missing" };
  }
  if (stepAssert.require_request_id && !entry.request_id) {
    return { ok: false, reason: "request_id is missing" };
  }
  if (typeof stepAssert.max_duration_ms === "number" && entry.duration_ms > stepAssert.max_duration_ms) {
    return {
      ok: false,
      reason: `duration ${entry.duration_ms}ms > ${stepAssert.max_duration_ms}ms`
    };
  }
  if (typeof stepAssert.error_includes === "string" && stepAssert.error_includes.trim()) {
    const haystack = String(entry.error || "");
    if (!haystack.includes(stepAssert.error_includes)) {
      return {
        ok: false,
        reason: `error does not include '${stepAssert.error_includes}'`
      };
    }
  }

  return { ok: true, reason: "" };
}

function buildFlowReport(rows, stepsCount, startedAt, stoppedReason = "") {
  const okSteps = rows.filter((item) => item.ok).length;
  const failedSteps = rows.length - okSteps;
  const assertFailed = rows.filter((item) => item.assert_ok === false).length;
  return {
    started_at: startedAt,
    completed_at: new Date().toISOString(),
    steps_total: stepsCount,
    steps_executed: rows.length,
    steps_ok: okSteps,
    steps_failed: failedSteps,
    steps_assert_failed: assertFailed,
    stopped_reason: stoppedReason,
    rows
  };
}

function downloadTextFile(filename, text, contentType = "text/plain;charset=utf-8") {
  if (typeof window === "undefined") return;
  const blob = new Blob([text], { type: contentType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function mdCell(input) {
  return String(input ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
}

function flowReportToMarkdown(report) {
  const lines = [
    "# Aionis Playground Flow Report",
    "",
    `- started_at: ${report.started_at}`,
    `- completed_at: ${report.completed_at}`,
    `- steps_total: ${report.steps_total}`,
    `- steps_executed: ${report.steps_executed}`,
    `- steps_ok: ${report.steps_ok}`,
    `- steps_failed: ${report.steps_failed}`,
    `- steps_assert_failed: ${report.steps_assert_failed}`,
    `- stopped_reason: ${report.stopped_reason || "none"}`,
    "",
    "| step | operation | status | ok | duration_ms | request_id | assert_ok | assert_reason |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |"
  ];

  for (const row of report.rows || []) {
    lines.push(
      `| ${mdCell(row.step)} | ${mdCell(row.operation)} | ${mdCell(row.status)} | ${mdCell(row.ok)} | ${mdCell(row.duration_ms)} | ${mdCell(row.request_id)} | ${mdCell(row.assert_ok)} | ${mdCell(row.assert_reason)} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

function computeRuntimeContext(history) {
  const context = {
    request_id: "",
    decision_id: "",
    run_id: ""
  };

  for (const item of history) {
    if (!context.request_id && item.request_id) context.request_id = item.request_id;
    if (!context.decision_id && item.decision_id) context.decision_id = item.decision_id;
    if (!context.run_id && item.run_id) context.run_id = item.run_id;
    if (context.request_id && context.decision_id && context.run_id) break;
  }

  return context;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function makeSessionTitle(text, fallback = "Untitled chat") {
  const raw = String(text || "").trim().replace(/\s+/g, " ");
  if (!raw) return fallback;
  return raw.length > 34 ? `${raw.slice(0, 34)}...` : raw;
}

function makeChatSession(title = "Untitled chat") {
  return {
    id: makeId("chat"),
    title,
    created_at: new Date().toISOString(),
    messages: []
  };
}

function extractRecallText(data) {
  if (!data || typeof data !== "object") return "";
  if (typeof data.context_text === "string" && data.context_text.trim()) return data.context_text.trim();
  if (typeof data.text === "string" && data.text.trim()) return data.text.trim();
  if (Array.isArray(data.items) && data.items.length > 0) {
    const lines = data.items
      .map((item) => {
        if (typeof item === "string") return item;
        if (item && typeof item === "object") {
          return String(item.text || item.summary || item.content || "").trim();
        }
        return "";
      })
      .filter(Boolean);
    if (lines.length > 0) return lines.join("\n");
  }
  return JSON.stringify(data, null, 2);
}

function encodeShareState(state) {
  if (typeof window === "undefined") return "";
  try {
    const text = JSON.stringify(state);
    const bytes = new TextEncoder().encode(text);
    let binary = "";
    for (const byte of bytes) {
      binary += String.fromCharCode(byte);
    }
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
  } catch {
    return "";
  }
}

function decodeShareState(token) {
  if (!token) return null;
  try {
    const normalized = token.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "===".slice((normalized.length + 3) % 4);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const text = new TextDecoder().decode(bytes);
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default function PlaygroundPage() {
  const [language, setLanguage] = useState("en");
  const [connection, setConnection] = useState(DEFAULT_CONNECTION);
  const [llmConfig, setLlmConfig] = useState(DEFAULT_CHAT_CONFIG);
  const [showApiKey, setShowApiKey] = useState(false);
  const [scenarioPreset, setScenarioPreset] = useState(DEFAULT_SCENARIO);
  const [operation, setOperation] = useState("write");
  const [payloadText, setPayloadText] = useState(pretty(defaultPayloadFor("write")));
  const [flowPreset, setFlowPreset] = useState(DEFAULT_FLOW_PRESET);
  const [flowText, setFlowText] = useState(makeFlowTextFromPreset(DEFAULT_FLOW_PRESET));
  const [flowStopOnHttpFail, setFlowStopOnHttpFail] = useState(true);
  const [flowStopOnAssertFail, setFlowStopOnAssertFail] = useState(true);
  const [history, setHistory] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [running, setRunning] = useState(false);
  const [chatRunning, setChatRunning] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [flowError, setFlowError] = useState("");
  const [flowRunNote, setFlowRunNote] = useState("");
  const [flowReport, setFlowReport] = useState(null);
  const [flowReportNote, setFlowReportNote] = useState("");
  const [shareNote, setShareNote] = useState("");
  const [inspectNote, setInspectNote] = useState("");
  const [chatNote, setChatNote] = useState("");
  const [chatError, setChatError] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [chatUseRecallContext, setChatUseRecallContext] = useState(true);
  const [chatAutoWriteMemory, setChatAutoWriteMemory] = useState(false);
  const [settingsTab, setSettingsTab] = useState("llm");
  const [llmTestRunning, setLlmTestRunning] = useState(false);
  const [llmTestNote, setLlmTestNote] = useState("");
  const [sessionTitleDraft, setSessionTitleDraft] = useState("");
  const [chainStatusFilter, setChainStatusFilter] = useState("all");
  const [chainOperationFilter, setChainOperationFilter] = useState("all");
  const [chatSessions, setChatSessions] = useState(() => [makeChatSession("Session 1")]);
  const [activeSessionId, setActiveSessionId] = useState("");
  const chatThreadRef = useRef(null);

  const tx = useMemo(() => I18N[language] || I18N.en, [language]);
  const tr = (key, vars = {}) => interpolate(tx[key] || I18N.en[key] || key, vars);
  const metaPack = useMemo(() => I18N_META[language] || null, [language]);

  const scenarioText = (scenario) => {
    const mapped = metaPack?.scenarios?.[scenario.key];
    return {
      label: mapped?.label || scenario.label,
      description: mapped?.description || scenario.description || ""
    };
  };
  const flowTextPack = (flowItem) => {
    const mapped = metaPack?.flows?.[flowItem.key];
    return {
      label: mapped?.label || flowItem.label,
      description: mapped?.description || flowItem.description || ""
    };
  };
  const operationText = (opKey) => {
    const base = OPERATION_MAP[opKey];
    const mapped = metaPack?.operations?.[opKey];
    return {
      label: mapped?.label || base?.label || opKey,
      description: mapped?.description || base?.description || ""
    };
  };

  const runtimeContext = useMemo(() => computeRuntimeContext(history), [history]);
  const active = useMemo(() => history.find((item) => item.id === activeId) || history[0] || null, [history, activeId]);
  const activeChatSession = useMemo(
    () => chatSessions.find((item) => item.id === activeSessionId) || chatSessions[0] || null,
    [chatSessions, activeSessionId]
  );
  const selectedScenarioView = useMemo(() => {
    const raw = SCENARIO_PRESET_MAP[scenarioPreset];
    return raw ? scenarioText(raw) : { label: "", description: "" };
  }, [scenarioPreset, metaPack]);
  const selectedOperationView = useMemo(() => operationText(operation), [operation, metaPack]);

  const metrics = useMemo(() => {
    const total = history.length;
    const success = history.filter((item) => item.ok).length;
    const failed = total - success;
    const avgLatency = total > 0
      ? Math.round(history.reduce((sum, item) => sum + (Number(item.duration_ms) || 0), 0) / total)
      : 0;
    return { total, success, failed, avgLatency };
  }, [history]);

  const previousSameOperation = useMemo(() => {
    if (!active) return null;
    const idx = history.findIndex((item) => item.id === active.id);
    if (idx < 0) return null;
    for (let i = idx + 1; i < history.length; i += 1) {
      if (history[i].operation === active.operation) return history[i];
    }
    return null;
  }, [active, history]);

  const responseDiff = useMemo(() => {
    if (!active || !previousSameOperation) return [];
    return collectDiff(previousSameOperation.data, active.data);
  }, [active, previousSameOperation]);

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const statusOk =
        chainStatusFilter === "all"
          ? true
          : chainStatusFilter === "ok"
            ? item.ok
            : !item.ok;
      const operationOk = chainOperationFilter === "all" ? true : item.operation === chainOperationFilter;
      return statusOk && operationOk;
    });
  }, [history, chainStatusFilter, chainOperationFilter]);

  function updateSessionById(sessionId, updater) {
    setChatSessions((prev) => prev.map((item) => (item.id === sessionId ? updater(item) : item)));
  }

  function appendMessage(sessionId, message) {
    updateSessionById(sessionId, (session) => {
      const nextTitle = session.messages.length === 0 && message.role === "user"
        ? makeSessionTitle(message.content, tr("untitled_chat"))
        : session.title;
      return {
        ...session,
        title: nextTitle,
        messages: [...session.messages, message]
      };
    });
  }

  function createSession() {
    const next = makeChatSession(`${tr("session")} ${chatSessions.length + 1}`);
    setChatSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    setChatInput("");
    setChatError("");
    setChatNote("");
  }

  function removeActiveSession() {
    if (!activeChatSession) return;
    setChatSessions((prev) => {
      if (prev.length <= 1) return prev;
      const next = prev.filter((item) => item.id !== activeChatSession.id);
      const replacement = next[0]?.id || "";
      setActiveSessionId(replacement);
      return next;
    });
    setChatError("");
    setChatNote("");
  }

  function renameActiveSession(nextTitle) {
    if (!activeChatSession) return;
    const normalized = makeSessionTitle(nextTitle, tr("untitled_chat"));
    updateSessionById(activeChatSession.id, (session) => ({
      ...session,
      title: normalized
    }));
    setSessionTitleDraft(normalized);
  }

  function clearActiveSessionMessages() {
    if (!activeChatSession || chatRunning) return;
    updateSessionById(activeChatSession.id, (session) => ({
      ...session,
      messages: []
    }));
    setChatNote(tr("clear_session_messages"));
    setChatError("");
  }

  async function copyText(value) {
    const text = String(value || "");
    if (!text || text === "-") return false;

    if (typeof window === "undefined") return false;
    if (navigator?.clipboard?.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    }

    try {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      textarea.style.position = "fixed";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      const ok = document.execCommand("copy");
      textarea.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function getOperationTemplate(nextOperation, nextConnection = connection, nextScenario = scenarioPreset) {
    let payload = defaultPayloadFor(nextOperation);
    const scenario = SCENARIO_PRESET_MAP[nextScenario];
    if (scenario?.payload_by_operation?.[nextOperation]) {
      payload = deepMerge(payload, scenario.payload_by_operation[nextOperation]);
    }
    return applyTenantScope(payload, nextConnection);
  }

  function materializePayload(rawPayload, runtime = runtimeContext) {
    const scoped = applyTenantScope(rawPayload, connection);
    return applyRuntimeVars(scoped, runtime, connection);
  }

  async function executeOne(nextOperation, preparedPayload) {
    const startedAt = new Date().toISOString();
    const response = await fetch("/api/playground/execute", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        operation: nextOperation,
        payload: preparedPayload,
        connection
      })
    });

    const result = await response.json().catch(() => ({ ok: false, error: "invalid_json_response" }));
    const id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const decisionId = findDecisionId(result.data) || findDecisionId(preparedPayload);
    const runId = findRunId(result.data) || findRunId(preparedPayload);

    const entry = {
      id,
      at: startedAt,
      operation: nextOperation,
      method: result.method || OPERATION_MAP[nextOperation]?.method || "POST",
      path: result.path || OPERATION_MAP[nextOperation]?.path || "",
      ok: result.ok === true,
      status: Number(result.status || 0),
      request_id: String(result.request_id || ""),
      duration_ms: Number(result.duration_ms || 0),
      payload: preparedPayload,
      data: result.data ?? null,
      error: result.error || "",
      decision_id: decisionId,
      run_id: runId
    };

    setHistory((prev) => [entry, ...prev]);
    setActiveId(entry.id);
    return entry;
  }

  async function runCurrent() {
    setErrorMessage("");
    setFlowError("");
    setFlowRunNote("");
    setFlowReport(null);
    setFlowReportNote("");

    let payload = null;
    try {
      payload = parseJsonObject(payloadText);
      payload = materializePayload(payload);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
      return;
    }

    setRunning(true);
    try {
      await executeOne(operation, payload);
    } finally {
      setRunning(false);
    }
  }

  async function runFlow() {
    setErrorMessage("");
    setFlowError("");
    setFlowRunNote("");
    setFlowReport(null);
    setFlowReportNote("");

    let steps = [];
    try {
      steps = parseFlowSteps(flowText);
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "invalid flow json");
      return;
    }

    setRunning(true);
    let flowRuntime = { ...runtimeContext };
    const startedAt = new Date().toISOString();
    const rows = [];
    let stoppedReason = "";
    let latestAssertError = "";

    try {
      for (let i = 0; i < steps.length; i += 1) {
        const step = steps[i];
        const payloadSeed = step.payload ? deepClone(step.payload) : getOperationTemplate(step.operation);
        const preparedPayload = materializePayload(payloadSeed, flowRuntime);
        const entry = await executeOne(step.operation, preparedPayload);

        flowRuntime = {
          request_id: entry.request_id || flowRuntime.request_id,
          decision_id: entry.decision_id || flowRuntime.decision_id,
          run_id: entry.run_id || flowRuntime.run_id
        };

        const assertResult = evaluateStepAssert(entry, step.assert);
        rows.push({
          step: i + 1,
          operation: step.operation,
          status: entry.status,
          ok: entry.ok,
          duration_ms: entry.duration_ms,
          request_id: entry.request_id || "",
          assert_ok: assertResult.ok,
          assert_reason: assertResult.reason || ""
        });

        if (!entry.ok && flowStopOnHttpFail) {
          stoppedReason = `stopped at step ${i + 1}: http failure`;
          break;
        }

        if (!assertResult.ok) {
          latestAssertError = `step ${i + 1} (${step.operation}) assert failed: ${assertResult.reason}`;
          if (flowStopOnAssertFail) {
            stoppedReason = `stopped at step ${i + 1}: assert failed`;
            break;
          }
        }
      }
    } catch (error) {
      setFlowError(error instanceof Error ? error.message : "flow execution failed");
    } finally {
      setFlowReport(buildFlowReport(rows, steps.length, startedAt, stoppedReason));
      if (latestAssertError) setFlowError(latestAssertError);
      if (stoppedReason) setFlowRunNote(stoppedReason);
      setRunning(false);
    }
  }

  function resetPayload(nextOperation) {
    setPayloadText(pretty(getOperationTemplate(nextOperation)));
  }

  function injectTenantScope() {
    try {
      const payload = parseJsonObject(payloadText);
      setPayloadText(pretty(applyTenantScope(payload, connection)));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
    }
  }

  function injectRuntimeVars() {
    try {
      const payload = parseJsonObject(payloadText);
      setPayloadText(pretty(materializePayload(payload)));
      setErrorMessage("");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "invalid payload json");
    }
  }

  function applyScenarioPreset() {
    const scenario = SCENARIO_PRESET_MAP[scenarioPreset];
    if (!scenario) return;

    const mergedConnection = {
      ...connection,
      ...(scenario.connection || {})
    };
    const nextOperation = scenario.default_operation || operation;
    const nextFlowPreset = scenario.flow_key && FLOW_PRESET_MAP[scenario.flow_key] ? scenario.flow_key : flowPreset;

    setConnection(mergedConnection);
    setOperation(nextOperation);
    setPayloadText(pretty(getOperationTemplate(nextOperation, mergedConnection, scenarioPreset)));
    setFlowPreset(nextFlowPreset);
    setFlowText(makeFlowTextFromPreset(nextFlowPreset));
    setErrorMessage("");
    setFlowError("");
    setFlowRunNote("");
    setFlowReport(null);
    setFlowReportNote("");
  }

  function exportSession() {
    const data = {
      exported_at: new Date().toISOString(),
      scenario: scenarioPreset,
      operation,
      flow: flowText,
      flow_options: {
        stop_on_http_fail: flowStopOnHttpFail,
        stop_on_assert_fail: flowStopOnAssertFail
      },
      connection: {
        base_url: connection.base_url,
        tenant_id: connection.tenant_id,
        scope: connection.scope,
        api_key: maskSecret(connection.api_key),
        bearer_token: maskSecret(connection.bearer_token),
        admin_token: maskSecret(connection.admin_token)
      },
      runtime_context: runtimeContext,
      history
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `aionis-playground-${Date.now()}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  function exportFlowReportJson() {
    if (!flowReport) return;
    const payload = {
      exported_at: new Date().toISOString(),
      flow_preset: flowPreset,
      flow_options: {
        stop_on_http_fail: flowStopOnHttpFail,
        stop_on_assert_fail: flowStopOnAssertFail
      },
      report: flowReport
    };
    downloadTextFile(
      `aionis-flow-report-${Date.now()}.json`,
      JSON.stringify(payload, null, 2),
      "application/json"
    );
    setFlowReportNote(tr("flow_report_json_exported"));
  }

  function exportFlowReportMarkdown() {
    if (!flowReport) return;
    downloadTextFile(
      `aionis-flow-report-${Date.now()}.md`,
      flowReportToMarkdown(flowReport),
      "text/markdown;charset=utf-8"
    );
    setFlowReportNote(tr("flow_report_md_exported"));
  }

  async function copyActiveId(kind, value) {
    const ok = await copyText(value);
    if (!ok) {
      setInspectNote(tr("copy_failed", { kind }));
      return;
    }
    setInspectNote(tr("copy_success", { kind }));
  }

  async function sendChatMessage() {
    const prompt = String(chatInput || "").trim();
    if (!prompt || chatRunning) return;
    if (!activeChatSession) return;

    setChatError("");
    setChatNote("");
    setInspectNote("");

    const userMessage = {
      id: makeId("msg"),
      role: "user",
      content: prompt,
      at: new Date().toISOString()
    };
    const baselineMessages = [...(activeChatSession.messages || []), userMessage];
    appendMessage(activeChatSession.id, userMessage);
    setChatInput("");

    setChatRunning(true);
    try {
      let memoryContext = "";
      if (chatUseRecallContext) {
        const recallTemplate = getOperationTemplate("recall_text");
        const recallPayload = {
          ...recallTemplate,
          query_text: prompt
        };
        const recallEntry = await executeOne("recall_text", materializePayload(recallPayload));
        if (recallEntry.ok) {
          memoryContext = extractRecallText(recallEntry.data);
          if (memoryContext) setChatNote(tr("chat_note_recall_injected"));
        } else {
          setChatNote(tr("chat_note_recall_failed"));
        }
      }

      const messages = [];
      if (llmConfig.system_prompt?.trim()) {
        messages.push({ role: "system", content: llmConfig.system_prompt.trim() });
      }
      if (memoryContext) {
        messages.push({
          role: "system",
          content: `Aionis memory context:\n${memoryContext}`
        });
      }
      messages.push(
        ...baselineMessages
          .filter((item) => item.role === "user" || item.role === "assistant")
          .slice(-20)
          .map((item) => ({ role: item.role, content: item.content }))
      );

      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: llmConfig,
          messages
        })
      });

      const result = await response.json().catch(() => null);
      if (!result || result.ok !== true) {
        throw new Error(result?.error || "llm_chat_failed");
      }

      const assistantText = String(result.text || "").trim() || "(empty response)";
      const assistantMessage = {
        id: makeId("msg"),
        role: "assistant",
        content: assistantText,
        at: new Date().toISOString(),
        meta: {
          model: result.model || llmConfig.model,
          usage: result.usage || null
        }
      };
      appendMessage(activeChatSession.id, assistantMessage);

      if (chatAutoWriteMemory) {
        const writeTemplate = getOperationTemplate("write");
        const writePayload = {
          ...writeTemplate,
          input_text: `User: ${prompt}\nAssistant: ${assistantText}`,
          nodes: [
            {
              client_id: makeId("chat_turn"),
              type: "interaction",
              text_summary: `User asked: ${prompt.slice(0, 120)}`
            }
          ],
          edges: []
        };
        await executeOne("write", materializePayload(writePayload));
        setChatNote((prev) => `${prev ? `${prev} ` : ""}${tr("chat_note_auto_write")}`.trim());
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "chat_send_failed";
      setChatError(message);
      appendMessage(activeChatSession.id, {
        id: makeId("msg"),
        role: "assistant",
        content: `${tr("chat_error_prefix")}${message}`,
        at: new Date().toISOString(),
        meta: { error: true }
      });
    } finally {
      setChatRunning(false);
    }
  }

  async function testLlmConnection() {
    setLlmTestNote("");
    if (llmTestRunning) return;
    setLlmTestRunning(true);
    try {
      const response = await fetch("/api/playground/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          config: llmConfig,
          messages: [{ role: "user", content: "Reply with: ok" }]
        })
      });

      const result = await response.json().catch(() => null);
      if (!result || result.ok !== true) {
        throw new Error(result?.error || "llm_connection_failed");
      }
      setLlmTestNote(tr("llm_ok", { model: result.model || llmConfig.model }));
    } catch (error) {
      setLlmTestNote(tr("llm_fail", { error: error instanceof Error ? error.message : "unknown_error" }));
    } finally {
      setLlmTestRunning(false);
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const rawConfig = window.localStorage.getItem(LLM_CONFIG_STORAGE_KEY);
      if (rawConfig) {
        const parsed = JSON.parse(rawConfig);
        if (parsed && typeof parsed === "object") {
          setLlmConfig((prev) => ({
            ...prev,
            ...parsed
          }));
        }
      }
    } catch {
      // ignore local storage read errors
    }

    try {
      const rawTab = window.localStorage.getItem(PLAYGROUND_SETTINGS_TAB_STORAGE_KEY);
      if (rawTab && SETTINGS_TABS.includes(rawTab)) {
        setSettingsTab(rawTab);
      }
    } catch {
      // ignore local storage read errors
    }

    try {
      const rawLanguage = window.localStorage.getItem(PLAYGROUND_LANGUAGE_STORAGE_KEY);
      if (rawLanguage === "zh" || rawLanguage === "en") {
        setLanguage(rawLanguage);
      } else if (String(window.navigator.language || "").toLowerCase().startsWith("zh")) {
        setLanguage("zh");
      }
    } catch {
      // ignore local storage read errors
    }

    try {
      const rawSessions = window.localStorage.getItem(CHAT_SESSION_STORAGE_KEY);
      const rawActive = window.localStorage.getItem(CHAT_SESSION_ACTIVE_KEY);
      if (rawSessions) {
        const parsed = JSON.parse(rawSessions);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalized = parsed
            .filter((item) => item && typeof item === "object" && typeof item.id === "string")
            .map((item) => ({
              id: item.id,
              title: typeof item.title === "string" ? item.title : tr("untitled_chat"),
              created_at: typeof item.created_at === "string" ? item.created_at : new Date().toISOString(),
              messages: Array.isArray(item.messages) ? item.messages : []
            }));
          if (normalized.length > 0) {
            setChatSessions(normalized);
            if (rawActive && normalized.some((item) => item.id === rawActive)) {
              setActiveSessionId(rawActive);
            } else {
              setActiveSessionId(normalized[0].id);
            }
            return;
          }
        }
      }
    } catch {
      // ignore local storage read errors
    }

    setActiveSessionId((prev) => prev || chatSessions[0]?.id || "");
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(LLM_CONFIG_STORAGE_KEY, JSON.stringify(llmConfig));
  }, [llmConfig]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(CHAT_SESSION_STORAGE_KEY, JSON.stringify(chatSessions));
  }, [chatSessions]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PLAYGROUND_SETTINGS_TAB_STORAGE_KEY, settingsTab);
  }, [settingsTab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(PLAYGROUND_LANGUAGE_STORAGE_KEY, language);
  }, [language]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!activeSessionId && chatSessions[0]?.id) {
      setActiveSessionId(chatSessions[0].id);
      return;
    }
    if (activeSessionId) window.localStorage.setItem(CHAT_SESSION_ACTIVE_KEY, activeSessionId);
  }, [activeSessionId, chatSessions]);

  function buildShareState() {
    return {
      version: 1,
      scenario_preset: scenarioPreset,
      operation,
      payload_text: payloadText,
      flow_preset: flowPreset,
      flow_text: flowText,
      flow_stop_on_http_fail: flowStopOnHttpFail,
      flow_stop_on_assert_fail: flowStopOnAssertFail,
      connection: {
        base_url: connection.base_url,
        tenant_id: connection.tenant_id,
        scope: connection.scope
      }
    };
  }

  async function copyShareLink() {
    if (typeof window === "undefined" || !navigator?.clipboard) return;
    const token = encodeShareState(buildShareState());
    if (!token) {
      setShareNote(tr("share_link_create_failed"));
      return;
    }
    const url = new URL(window.location.href);
    url.searchParams.set("pg", token);
    try {
      await navigator.clipboard.writeText(url.toString());
      setShareNote(tr("share_link_copied"));
    } catch {
      setShareNote(tr("share_link_copy_failed"));
    }
  }

  useEffect(() => {
    if (typeof window === "undefined") return;
    const token = new URLSearchParams(window.location.search).get("pg");
    if (!token) return;

    const parsed = decodeShareState(token);
    if (!parsed || typeof parsed !== "object") {
      setShareNote(tr("share_link_invalid"));
      return;
    }

    if (typeof parsed.scenario_preset === "string" && SCENARIO_PRESET_MAP[parsed.scenario_preset]) {
      setScenarioPreset(parsed.scenario_preset);
    }

    if (typeof parsed.operation === "string" && OPERATION_MAP[parsed.operation]) {
      setOperation(parsed.operation);
    }

    if (typeof parsed.payload_text === "string") {
      setPayloadText(parsed.payload_text);
    }

    if (typeof parsed.flow_preset === "string" && FLOW_PRESET_MAP[parsed.flow_preset]) {
      setFlowPreset(parsed.flow_preset);
    }

    if (typeof parsed.flow_text === "string") {
      setFlowText(parsed.flow_text);
    }

    if (typeof parsed.flow_stop_on_http_fail === "boolean") {
      setFlowStopOnHttpFail(parsed.flow_stop_on_http_fail);
    }

    if (typeof parsed.flow_stop_on_assert_fail === "boolean") {
      setFlowStopOnAssertFail(parsed.flow_stop_on_assert_fail);
    }

    if (parsed.connection && typeof parsed.connection === "object") {
      setConnection((prev) => ({
        ...prev,
        base_url: String(parsed.connection.base_url || prev.base_url),
        tenant_id: String(parsed.connection.tenant_id || prev.tenant_id),
        scope: String(parsed.connection.scope || prev.scope)
      }));
    }

    setShareNote(tr("share_link_loaded"));
  }, []);

  useEffect(() => {
    setInspectNote("");
  }, [activeId]);

  useEffect(() => {
    setSessionTitleDraft(activeChatSession?.title || "");
  }, [activeSessionId, activeChatSession?.title]);

  useEffect(() => {
    const node = chatThreadRef.current;
    if (!node) return;
    node.scrollTop = node.scrollHeight;
  }, [activeSessionId, activeChatSession?.messages.length]);

  return (
    <div className="oa-layout">
      <aside className="oa-pane oa-left">
        <div className="oa-brand">
          <p className="kicker">{tr("app_name")}</p>
          <h1>{tr("app_subtitle")}</h1>
          <div className="lang-switch">
            <button type="button" className={language === "en" ? "active" : ""} onClick={() => setLanguage("en")}>EN</button>
            <button type="button" className={language === "zh" ? "active" : ""} onClick={() => setLanguage("zh")}>中文</button>
          </div>
        </div>

        <section className="oa-section">
          <div className="panel-head">
            <h2>{tr("scenario")}</h2>
          </div>
          <label>
            {tr("scenario_preset")}
            <select value={scenarioPreset} onChange={(event) => setScenarioPreset(event.target.value)}>
              {SCENARIO_PRESETS.map((item) => (
                <option key={item.key} value={item.key}>{scenarioText(item).label}</option>
              ))}
            </select>
          </label>
          <p className="muted tiny">{selectedScenarioView.description}</p>
          <button type="button" className="ghost" onClick={applyScenarioPreset} disabled={running || chatRunning}>{tr("apply_preset")}</button>
        </section>

        <section className="oa-section">
          <div className="panel-head">
            <h2>{tr("sessions")}</h2>
            <span className="tag">{chatSessions.length}</span>
          </div>
          <div className="inline-actions">
            <button type="button" className="ghost" onClick={createSession} disabled={chatRunning}>{tr("new")}</button>
            <button type="button" className="ghost danger" onClick={removeActiveSession} disabled={chatSessions.length <= 1 || chatRunning}>{tr("delete")}</button>
            <button type="button" className="ghost" onClick={clearActiveSessionMessages} disabled={!activeChatSession || chatRunning}>{tr("clear_chat")}</button>
          </div>
          <label>
            {tr("active_title")}
            <input
              value={sessionTitleDraft}
              onChange={(event) => setSessionTitleDraft(event.target.value)}
              onBlur={() => renameActiveSession(sessionTitleDraft)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  renameActiveSession(sessionTitleDraft);
                }
              }}
              disabled={!activeChatSession}
            />
          </label>
          <div className="session-list">
            {chatSessions.map((item) => (
              <button
                type="button"
                key={item.id}
                className={`session-item ${activeChatSession?.id === item.id ? "active" : ""}`}
                onClick={() => setActiveSessionId(item.id)}
              >
                <span>{item.title}</span>
                <span className="tiny mono">{item.messages.length}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="oa-section oa-grow">
          <div className="panel-head">
            <h2>{tr("history")}</h2>
            <span className="tag">{filteredHistory.length}/{history.length}</span>
          </div>
          <div className="filters-row">
            <label className="filter-field">
              {tr("status")}
              <select value={chainStatusFilter} onChange={(event) => setChainStatusFilter(event.target.value)}>
                {CHAIN_STATUS_FILTERS.map((item) => (
                  <option key={item.key} value={item.key}>{tr(item.label_key)}</option>
                ))}
              </select>
            </label>
            <label className="filter-field">
              {tr("operation")}
              <select value={chainOperationFilter} onChange={(event) => setChainOperationFilter(event.target.value)}>
                <option value="all">{tr("status_all")}</option>
                {OPERATION_LIST.map((item) => (
                  <option key={item.key} value={item.key}>{operationText(item.key).label}</option>
                ))}
              </select>
            </label>
          </div>
          {filteredHistory.length === 0 ? (
            <p className="muted tiny">{tr("no_matching_requests")}</p>
          ) : (
            <div className="chain-list">
              {filteredHistory.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={`chain-item ${active?.id === item.id ? "active" : ""}`}
                  onClick={() => setActiveId(item.id)}
                >
                  <div>
                    <p className="mono">{item.operation}</p>
                    <p className="tiny muted">{item.status || "ERR"} · {item.duration_ms}ms</p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </aside>

      <section className="oa-pane oa-center">
        <header className="oa-center-head">
          <div>
            <p className="kicker">{tr("session")}</p>
            <h2>{activeChatSession?.title || tr("untitled_chat")}</h2>
            <p className="muted tiny">{tr("request_id")} <span className="mono">{runtimeContext.request_id || "-"}</span> · {tr("decision_id")} <span className="mono">{runtimeContext.decision_id || "-"}</span> · {tr("run_id")} <span className="mono">{runtimeContext.run_id || "-"}</span></p>
          </div>
          <div className="inline-actions">
            <button type="button" onClick={runCurrent} disabled={running || chatRunning}>{running ? tr("running") : tr("run_op")}</button>
            <button type="button" className="ghost" onClick={runFlow} disabled={running || chatRunning}>{running ? tr("running") : tr("run_flow")}</button>
          </div>
        </header>

        <div className="oa-metrics">
          <span>{tr("metric_total")} {metrics.total}</span>
          <span>{tr("metric_ok")} {metrics.success}</span>
          <span>{tr("metric_fail")} {metrics.failed}</span>
          <span>{tr("metric_avg")} {metrics.avgLatency}ms</span>
        </div>

        <div className="oa-chat-surface">
          <div className="chat-thread" ref={chatThreadRef}>
            {(activeChatSession?.messages || []).length === 0 ? (
              <p className="muted tiny">{tr("chat_empty_hint")}</p>
            ) : (
              activeChatSession.messages.map((message) => (
                <article key={message.id} className={`chat-bubble ${message.role}`}>
                  <div className="chat-meta">
                    <span>{message.role === "user" ? (language === "zh" ? "用户" : "user") : (language === "zh" ? "助手" : "assistant")}</span>
                    <span className="mono tiny">{message.at || "-"}</span>
                  </div>
                  <p>{message.content}</p>
                  {message.meta?.model ? <p className="tiny muted">{tr("model_label")}: <span className="mono">{message.meta.model}</span></p> : null}
                  {message.meta?.usage?.total_tokens ? <p className="tiny muted">{tr("tokens_label")}: <span className="mono">{message.meta.usage.total_tokens}</span></p> : null}
                </article>
              ))
            )}
          </div>

          <details className="oa-inspector" open={Boolean(active)}>
            <summary>{tr("inspector")}</summary>
            {!active ? (
              <p className="muted tiny">{tr("inspector_empty")}</p>
            ) : (
              <div className="inspect-block">
                <p className="tiny muted">{tr("request_id")}: <span className="mono">{active.request_id || "-"}</span></p>
                <p className="tiny muted">{tr("decision_id")}: <span className="mono">{active.decision_id || "-"}</span></p>
                <p className="tiny muted">{tr("run_id")}: <span className="mono">{active.run_id || "-"}</span></p>
                <div className="inline-actions mini-actions">
                  <button type="button" className="ghost" onClick={() => copyActiveId("request_id", active.request_id)} disabled={!active.request_id}>{tr("copy_request_id")}</button>
                  <button type="button" className="ghost" onClick={() => copyActiveId("decision_id", active.decision_id)} disabled={!active.decision_id}>{tr("copy_decision_id")}</button>
                  <button type="button" className="ghost" onClick={() => copyActiveId("run_id", active.run_id)} disabled={!active.run_id}>{tr("copy_run_id")}</button>
                </div>
                {inspectNote ? <p className="note-line">{inspectNote}</p> : null}
                {active.error ? <p className="error">{tr("error_prefix")}: {active.error}</p> : null}
                <details>
                  <summary>{tr("request_payload")}</summary>
                  <pre>{pretty(active.payload)}</pre>
                </details>
                <details>
                  <summary>{tr("response_body")}</summary>
                  <pre>{pretty(active.data)}</pre>
                </details>
                <details>
                  <summary>{tr("response_diff")}</summary>
                  {!previousSameOperation ? (
                    <p className="muted tiny">{tr("no_previous_response")}</p>
                  ) : responseDiff.length === 0 ? (
                    <p className="muted tiny">{tr("no_structural_diff")}</p>
                  ) : (
                    <div className="diff-list">
                      {responseDiff.slice(0, 20).map((item) => (
                        <div className="diff-item" key={`${item.path}-${JSON.stringify(item.after)}`}>
                          <p className="mono tiny"><strong>{item.path}</strong></p>
                          <p className="tiny muted">{tr("before_label")}: <span className="mono">{JSON.stringify(item.before)}</span></p>
                          <p className="tiny muted">{tr("after_label")}: <span className="mono">{JSON.stringify(item.after)}</span></p>
                        </div>
                      ))}
                    </div>
                  )}
                </details>
              </div>
            )}
          </details>
        </div>

        <form
          className="composer"
          onSubmit={(event) => {
            event.preventDefault();
            sendChatMessage();
          }}
        >
          <textarea
            rows={3}
            placeholder={tr("composer_placeholder")}
            value={chatInput}
            onChange={(event) => setChatInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                sendChatMessage();
              }
            }}
          />
          <div className="prompt-chips">
            {CHAT_PROMPT_CHIPS.map((chip) => (
              <button
                type="button"
                key={chip.key}
                className="ghost chip-btn"
                onClick={() => setChatInput(language === "zh" ? chip.zh : chip.en)}
                disabled={chatRunning || running}
              >
                {language === "zh" ? chip.zh : chip.en}
              </button>
            ))}
          </div>
          <div className="composer-foot">
            <div className="toggle-row">
              <label className="checkbox-row">
                <input type="checkbox" checked={chatUseRecallContext} onChange={(event) => setChatUseRecallContext(event.target.checked)} />
                {tr("use_recall")}
              </label>
              <label className="checkbox-row">
                <input type="checkbox" checked={chatAutoWriteMemory} onChange={(event) => setChatAutoWriteMemory(event.target.checked)} />
                {tr("auto_write")}
              </label>
            </div>
            <button type="submit" disabled={chatRunning || running || !chatInput.trim()}>{chatRunning ? tr("sending") : tr("send")}</button>
          </div>
          {chatNote ? <p className="note-line">{chatNote}</p> : null}
          {chatError ? <p className="error">{chatError}</p> : null}
        </form>
      </section>

      <aside className="oa-pane oa-right">
        <div className="oa-tabs">
          {SETTINGS_TABS.map((tab) => (
            <button
              type="button"
              key={tab}
              className={`tab-btn ${settingsTab === tab ? "active" : ""}`}
              onClick={() => setSettingsTab(tab)}
            >
              {tr(tab)}
            </button>
          ))}
        </div>

        <div className="oa-tab-panel">
          {settingsTab === "llm" ? (
            <div className="form-grid compact">
              <label>
                {tr("provider")}
                <input value={llmConfig.provider} onChange={(event) => setLlmConfig((prev) => ({ ...prev, provider: event.target.value }))} />
              </label>
              <label>
                {tr("base_url")}
                <input value={llmConfig.base_url} onChange={(event) => setLlmConfig((prev) => ({ ...prev, base_url: event.target.value }))} />
              </label>
              <label>
                {tr("model")}
                <input value={llmConfig.model} onChange={(event) => setLlmConfig((prev) => ({ ...prev, model: event.target.value }))} />
              </label>
              <label>
                {tr("api_key")}
                <input
                  type={showApiKey ? "text" : "password"}
                  value={llmConfig.api_key}
                  onChange={(event) => setLlmConfig((prev) => ({ ...prev, api_key: event.target.value }))}
                  placeholder="sk-..."
                />
              </label>
              <div className="inline-actions">
                <button type="button" className="ghost" onClick={() => setShowApiKey((prev) => !prev)}>{showApiKey ? tr("hide") : tr("show")}</button>
                <button type="button" className="ghost danger" onClick={() => setLlmConfig((prev) => ({ ...prev, api_key: "" }))}>{tr("clear")}</button>
                <button type="button" className="ghost" onClick={testLlmConnection} disabled={llmTestRunning}>
                  {llmTestRunning ? tr("testing") : tr("test_connection")}
                </button>
              </div>
              {llmTestNote ? <p className="note-line">{llmTestNote}</p> : null}
              <label>
                {tr("temperature")}
                <input type="number" min="0" max="2" step="0.1" value={llmConfig.temperature} onChange={(event) => setLlmConfig((prev) => ({ ...prev, temperature: Number(event.target.value) }))} />
              </label>
              <label>
                {tr("max_tokens")}
                <input type="number" min="1" step="1" value={llmConfig.max_tokens} onChange={(event) => setLlmConfig((prev) => ({ ...prev, max_tokens: Number(event.target.value) }))} />
              </label>
              <label>
                {tr("system_prompt")}
                <textarea rows={5} value={llmConfig.system_prompt} onChange={(event) => setLlmConfig((prev) => ({ ...prev, system_prompt: event.target.value }))} />
              </label>
            </div>
          ) : null}

          {settingsTab === "connection" ? (
            <div className="form-grid compact">
              <label>{tr("base_url")}<input value={connection.base_url} onChange={(event) => setConnection((prev) => ({ ...prev, base_url: event.target.value }))} /></label>
              <label>{tr("tenant_id")}<input value={connection.tenant_id} onChange={(event) => setConnection((prev) => ({ ...prev, tenant_id: event.target.value }))} /></label>
              <label>{tr("scope")}<input value={connection.scope} onChange={(event) => setConnection((prev) => ({ ...prev, scope: event.target.value }))} /></label>
              <label>{tr("x_api_key")}<input value={connection.api_key} onChange={(event) => setConnection((prev) => ({ ...prev, api_key: event.target.value }))} /></label>
              <label>{tr("bearer_token")}<input value={connection.bearer_token} onChange={(event) => setConnection((prev) => ({ ...prev, bearer_token: event.target.value }))} /></label>
              <label>{tr("x_admin_token")}<input value={connection.admin_token} onChange={(event) => setConnection((prev) => ({ ...prev, admin_token: event.target.value }))} /></label>
            </div>
          ) : null}

          {settingsTab === "operation" ? (
            <div className="form-grid compact">
              <label>
                {tr("operation")}
                <select
                  value={operation}
                  onChange={(event) => {
                    const next = event.target.value;
                    setOperation(next);
                    resetPayload(next);
                  }}
                >
                  {OPERATION_LIST.map((item) => (
                    <option key={item.key} value={item.key}>{operationText(item.key).label} ({item.method} {item.path})</option>
                  ))}
                </select>
              </label>
              <p className="muted tiny">{selectedOperationView.description}</p>
              <label>
                {tr("payload_json")}
                <textarea value={payloadText} onChange={(event) => setPayloadText(event.target.value)} rows={10} />
              </label>
              <div className="inline-actions">
                <button type="button" className="ghost" onClick={() => resetPayload(operation)} disabled={running || chatRunning}>{tr("reset")}</button>
                <button type="button" className="ghost" onClick={injectTenantScope} disabled={running || chatRunning}>{tr("inject_tenant_scope")}</button>
                <button type="button" className="ghost" onClick={injectRuntimeVars} disabled={running || chatRunning}>{tr("inject_runtime")}</button>
              </div>
              {errorMessage ? <p className="error">{errorMessage}</p> : null}
            </div>
          ) : null}

          {settingsTab === "flow" ? (
            <div className="form-grid compact">
              <label>
                {tr("flow_preset")}
                <select
                  value={flowPreset}
                  onChange={(event) => {
                    const next = event.target.value;
                    setFlowPreset(next);
                    setFlowText(makeFlowTextFromPreset(next));
                    setFlowError("");
                    setFlowRunNote("");
                  }}
                >
                  {FLOW_PRESETS.map((item) => (
                    <option key={item.key} value={item.key}>{flowTextPack(item).label}</option>
                  ))}
                </select>
              </label>
              <label>
                {tr("flow_json")}
                <textarea value={flowText} onChange={(event) => setFlowText(event.target.value)} rows={8} />
              </label>
              <div className="toggle-row">
                <label className="checkbox-row">
                  <input type="checkbox" checked={flowStopOnHttpFail} onChange={(event) => setFlowStopOnHttpFail(event.target.checked)} />
                  {tr("stop_on_http")}
                </label>
                <label className="checkbox-row">
                  <input type="checkbox" checked={flowStopOnAssertFail} onChange={(event) => setFlowStopOnAssertFail(event.target.checked)} />
                  {tr("stop_on_assert")}
                </label>
              </div>
              {flowError ? <p className="error">{flowError}</p> : null}
              {flowRunNote ? <p className="note-line">{flowRunNote}</p> : null}
              {flowReport ? (
                <div className="flow-report">
                  <div className="flow-report-head">
                    <strong>{tr("flow_report")}</strong>
                    <span className="mono tiny">{flowReport.steps_executed}/{flowReport.steps_total}</span>
                  </div>
                  <div className="flow-report-metrics">
                    <span>{tr("flow_ok_label")}: {flowReport.steps_ok}</span>
                    <span>{tr("flow_failed_label")}: {flowReport.steps_failed}</span>
                    <span>{tr("flow_assert_failed_label")}: {flowReport.steps_assert_failed}</span>
                  </div>
                  <div className="inline-actions">
                    <button type="button" className="ghost" onClick={exportFlowReportJson} disabled={running || chatRunning}>{tr("export_json")}</button>
                    <button type="button" className="ghost" onClick={exportFlowReportMarkdown} disabled={running || chatRunning}>{tr("export_md")}</button>
                  </div>
                  {flowReportNote ? <p className="note-line">{flowReportNote}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}

          {settingsTab === "export" ? (
            <div className="form-grid compact">
              <div className="inline-actions">
                <button type="button" className="ghost" onClick={copyShareLink} disabled={running || chatRunning}>{tr("copy_share_link")}</button>
                <button type="button" className="ghost" onClick={exportSession} disabled={history.length === 0 || running || chatRunning}>{tr("export_session_json")}</button>
              </div>
              <button
                type="button"
                className="ghost danger"
                onClick={() => {
                  setHistory([]);
                  setActiveId("");
                  setErrorMessage("");
                  setFlowError("");
                  setFlowRunNote("");
                  setFlowReport(null);
                  setFlowReportNote("");
                  setInspectNote("");
                  setShareNote(tr("history_cleared"));
                }}
                disabled={history.length === 0 || running || chatRunning}
              >
                {tr("clear_history")}
              </button>
              {shareNote ? <p className="note-line">{shareNote}</p> : null}
            </div>
          ) : null}
        </div>
      </aside>
    </div>
  );
}
