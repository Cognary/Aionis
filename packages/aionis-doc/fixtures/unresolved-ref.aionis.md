@doc {
  id: "unresolved-001"
  version: "1.0"
}

@context {
  objective: "Known field"
}

@execute {
  module: "demo.lookup.v1"
  input_ref: "ctx.missing"
  output_ref: "out.result"
}
