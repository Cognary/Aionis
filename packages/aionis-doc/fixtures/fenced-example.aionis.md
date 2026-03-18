```text
@doc {
  id: "fake-doc"
  version: "1.0"
}

@execute {
  module: "fake.module.v1"
  input_ref: "ctx"
  output_ref: "out.fake"
}
```

@doc {
  id: "real-doc"
  version: "1.0"
}

@context {
  objective: "Use only live directives outside fences"
}

@execute {
  module: "real.module.v1"
  input_ref: "ctx"
  output_ref: "out.real"
}
