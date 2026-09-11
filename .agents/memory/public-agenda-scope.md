---
name: Public agenda scope
description: Security rules for weekly public agenda links and their WhatsApp preparation flow.
---

Weekly public agenda links must capture the creator's territorial scope when created. Public event queries must use that snapshot, and non-admin users may prepare messages only from links they created.

**Why:** A public token bypasses normal authentication by design. Without a persisted scope, it can disclose events from other territories; accepting another user's sequential share ID also exposes an otherwise unguessable token.

**How to apply:** Any new public agenda output must filter by the stored share scope rather than the current caller. Any authenticated mutation of a share must enforce ownership unless the caller is a general administrator.