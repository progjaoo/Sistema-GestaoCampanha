---
name: API codegen body names
description: Non-obvious Orval naming collision behavior in the shared OpenAPI/Zod generation.
---

When adding request bodies to the shared OpenAPI contract, prefer a named reusable component schema and reference it from the operation. Inline request-body schemas can make Orval emit the same body name as both a Zod value and a TypeScript type, breaking the shared library typecheck.

**Why:** The generated API and generated TypeScript schema barrels share one package namespace, so an operation-derived body name can collide even when the OpenAPI document itself is valid.

**How to apply:** After changing `lib/api-spec/openapi.yaml`, run the API codegen and the workspace library typecheck before editing generated output manually.