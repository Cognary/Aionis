@doc {
  id: "primary-doc"
  version: "1.0"
}

@doc {
  id: "secondary-doc"
  version: "2.0"
}

@context {
  objective: "Trigger duplicate doc diagnostic"
}

@execute {
  module: "demo.duplicate.v1"
  input_ref: "ctx"
  output_ref: "out.duplicate"
}
