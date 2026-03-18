@doc {
  id: "workflow-001"
  version: "1.0"
  kind: "workflow"
}

@context {
  product: "EVA"
  audience: ["founders", "operators"]
}

@execute {
  module: "research.claims.v1"
  input_ref: "ctx"
  output_ref: "run.claims"
}

@execute {
  module: "copy.hero.v1"
  input_ref: "run.claims"
  output_ref: "out.hero"
  depends_on: ["run.claims"]
}

@replay {
  executable: true
  mode: "deterministic"
  expected_outputs: ["out.hero"]
}
