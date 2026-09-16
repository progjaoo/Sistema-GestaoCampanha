---
name: Campaign frontend build environment
description: Required environment variables for validating the campaign frontend build outside its managed workflow.
---

The campaign frontend Vite configuration requires both `PORT` and `BASE_PATH`; the artifact manifest provides `PORT=20777` and `BASE_PATH=/`.

**Why:** Running the package build without the manifest-provided values fails before Vite can compile, which can look like an application regression.

**How to apply:** When running a direct validation command, provide both variables or use the managed web workflow.