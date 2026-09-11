---
name: Campaign import data quality
description: Data-quality constraints that must remain true when extending the campaign import and review flow.
---

The campaign source is intentionally not fully clean: some rows have missing leadership names or shifted fields, and three federal-deputy links are explicitly marked for manual review. Preserve the row and its source trace instead of silently repairing, dropping, or inferring identity.

**Why:** The source analysis treats incomplete and ambiguous rows as evidence that needs a human decision; automatic fusion or correction would change campaign relationships and invalidate the audit trail.

**How to apply:** Keep nullable source-backed fields nullable in storage, surface a readable placeholder only in derived read models, and make review decisions explicit and persistent.