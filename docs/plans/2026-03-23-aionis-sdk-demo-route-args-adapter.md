# Aionis SDK Demo Route Args Adapter

This slice separates the demo route contract from the adapter that maps full runtime route args into that contract.

After this change:

1. `http-host-sdk-demo.ts` owns demo route registration only
2. `http-host-sdk-demo-args.ts` owns the full-to-demo adaptation
3. `runtime-entry-sdk-demo.ts` wires the adapter into the shared bootstrap

That split matters because public shrink work gets easier when the exported demo host module no longer imports or exposes the full runtime host route-args shape.
