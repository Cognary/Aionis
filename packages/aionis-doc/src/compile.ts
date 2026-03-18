import type { DirectiveNode } from "./ast/types.js";
import type { Diagnostic, SourceRange } from "./diagnostics/types.js";
import type { ExecutionGraph } from "./graph/types.js";
import type { ExecutionPlanV1 } from "./plan/types.js";
import type {
  AionisDocIR,
  AionisObject,
  AionisValue,
  ContextIR,
  DecisionIR,
  DocMetaIR,
  EvidenceIR,
  ExecuteIR,
  MemoryIR,
  PlanIR,
  ReplayIR,
  StateIR,
} from "./ir/types.js";
import { parseAst } from "./parser/parseAst.js";
import { resolveRefs } from "./refs/resolveRefs.js";
import { scanSource } from "./scanner/scanSource.js";
import { validateIrSchemas } from "./schema/validateIrSchemas.js";
import { buildExecutionGraph } from "./graph/buildExecutionGraph.js";
import type { DocumentNode } from "./ast/types.js";
import { buildExecutionPlanV1 } from "./plan/buildExecutionPlan.js";

export interface CompileResult {
  ast: DocumentNode;
  ir: AionisDocIR;
  graph: ExecutionGraph | null;
  plan: ExecutionPlanV1;
  diagnostics: Diagnostic[];
}

function isObject(value: AionisValue | null): value is AionisObject {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function asString(value: AionisValue | undefined): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function asBoolean(value: AionisValue | undefined): boolean | undefined {
  return typeof value === "boolean" ? value : undefined;
}

function asNumber(value: AionisValue | undefined): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function asStringArray(value: AionisValue | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const strings = value.filter((item): item is string => typeof item === "string");
  return strings.length === value.length ? strings : undefined;
}

function makeDiagnostic(loc: SourceRange | undefined, code: string, message: string): Diagnostic {
  return {
    severity: "error",
    code,
    message,
    loc: loc ?? {
      start: { line: 1, column: 1, offset: 0 },
      end: { line: 1, column: 1, offset: 0 },
    },
  };
}

function normalizeDoc(payload: AionisObject, loc: SourceRange | undefined): DocMetaIR {
  return {
    id: asString(payload.id) ?? "",
    version: asString(payload.version) ?? "",
    kind: asString(payload.kind),
    title: asString(payload.title),
    status: asString(payload.status),
    tags: asStringArray(payload.tags),
    data: payload,
    loc,
  };
}

function normalizeContext(payload: AionisObject, loc: SourceRange | undefined): ContextIR {
  return {
    objective: asString(payload.objective),
    audience: asStringArray(payload.audience),
    constraints: asStringArray(payload.constraints),
    data: payload,
    loc,
  };
}

function normalizePlan(payload: AionisObject, loc: SourceRange | undefined): PlanIR {
  return {
    steps: asStringArray(payload.steps),
    success_criteria: asStringArray(payload.success_criteria),
    checkpoints: asStringArray(payload.checkpoints),
    fallbacks: asStringArray(payload.fallbacks),
    data: payload,
    loc,
  };
}

function normalizeExecute(payload: AionisObject, loc: SourceRange | undefined): ExecuteIR {
  return {
    module: asString(payload.module),
    tool: asString(payload.tool),
    agent: asString(payload.agent),
    input: isObject(payload.input) ? payload.input : undefined,
    input_ref: asString(payload.input_ref),
    output_ref: asString(payload.output_ref),
    deterministic: asBoolean(payload.deterministic),
    depends_on: asStringArray(payload.depends_on),
    data: payload,
    loc,
  };
}

function normalizeDecision(payload: AionisObject, loc: SourceRange | undefined): DecisionIR {
  return {
    decision: asString(payload.decision),
    rationale: asString(payload.rationale),
    confidence: asNumber(payload.confidence),
    data: payload,
    loc,
  };
}

function normalizeEvidence(payload: AionisObject, loc: SourceRange | undefined): EvidenceIR {
  return {
    sources: Array.isArray(payload.sources) ? payload.sources : undefined,
    confidence: asNumber(payload.confidence),
    claims_supported: asStringArray(payload.claims_supported),
    data: payload,
    loc,
  };
}

function normalizeReplay(payload: AionisObject, loc: SourceRange | undefined): ReplayIR {
  const rawMode = asString(payload.mode);
  return {
    executable: asBoolean(payload.executable),
    mode:
      rawMode === "deterministic" || rawMode === "assisted" || rawMode === "advisory" ? rawMode : undefined,
    workflow_id: asString(payload.workflow_id),
    expected_outputs: asStringArray(payload.expected_outputs),
    data: payload,
    loc,
  };
}

function normalizeMemory(payload: AionisObject, loc: SourceRange | undefined): MemoryIR {
  return {
    topics: asStringArray(payload.topics),
    entities: asStringArray(payload.entities),
    writeback: asBoolean(payload.writeback),
    summary_layer: asString(payload.summary_layer),
    data: payload,
    loc,
  };
}

function normalizeState(payload: AionisObject, loc: SourceRange | undefined): StateIR {
  return {
    phase: asString(payload.phase),
    run_id: asString(payload.run_id),
    owner: asString(payload.owner),
    data: payload,
    loc,
  };
}

function normalizeAstToIr(ast: DocumentNode): AionisDocIR {
  const ir: AionisDocIR = {
    doc: null,
    context: [],
    plans: [],
    executions: [],
    decisions: [],
    evidence: [],
    replay: [],
    memory: [],
    state: [],
    diagnostics: [],
  };

  for (const child of ast.children) {
    if (child.type !== "DirectiveNode") continue;
    const directive = child as DirectiveNode;
    if (!isObject(directive.payload)) {
      if (directive.payload === null) continue;
      ir.diagnostics.push(makeDiagnostic(directive.loc, "INVALID_SCHEMA", `@${directive.name} expects an object payload.`));
      continue;
    }

    switch (directive.name) {
      case "doc":
        if (ir.doc) {
          ir.diagnostics.push(makeDiagnostic(directive.loc, "DUPLICATE_DOC", "Only one @doc directive is allowed."));
        } else {
          ir.doc = normalizeDoc(directive.payload, directive.loc);
        }
        break;
      case "context":
        ir.context.push(normalizeContext(directive.payload, directive.loc));
        break;
      case "plan":
        ir.plans.push(normalizePlan(directive.payload, directive.loc));
        break;
      case "execute":
        ir.executions.push(normalizeExecute(directive.payload, directive.loc));
        break;
      case "decision":
        ir.decisions.push(normalizeDecision(directive.payload, directive.loc));
        break;
      case "evidence":
        ir.evidence.push(normalizeEvidence(directive.payload, directive.loc));
        break;
      case "replay":
        ir.replay.push(normalizeReplay(directive.payload, directive.loc));
        break;
      case "memory":
        ir.memory.push(normalizeMemory(directive.payload, directive.loc));
        break;
      case "state":
        ir.state.push(normalizeState(directive.payload, directive.loc));
        break;
      default:
        break;
    }
  }

  return ir;
}

export function compileAionisDoc(source: string): CompileResult {
  const scan = scanSource(source);
  const ast = parseAst(scan);
  const ir = normalizeAstToIr(ast);
  const schemaDiagnostics = validateIrSchemas(ir);
  const refResult = resolveRefs(ir);
  const graphResult = buildExecutionGraph(refResult.ir);
  const diagnostics = [
    ...ast.diagnostics,
    ...ir.diagnostics,
    ...schemaDiagnostics,
    ...refResult.diagnostics,
    ...graphResult.diagnostics,
  ];
  const plan = buildExecutionPlanV1({
    ir: refResult.ir,
    graph: graphResult.value,
    diagnostics,
  });

  return {
    ast,
    ir: refResult.ir,
    graph: graphResult.value,
    plan,
    diagnostics,
  };
}
