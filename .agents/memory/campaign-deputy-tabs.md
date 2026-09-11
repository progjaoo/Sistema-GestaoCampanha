---
name: Campaign deputy tab source of truth
description: Why federal deputy tabs in the campaign workbook must remain derived views.
---

The 17 federal-deputy tabs in the structured campaign workbook are derived recuts of the city tabs, not an independent source of truth. Some contain copied or stale blocks that disagree with city-level records.

**Why:** The workbook's QA sheet explicitly identifies duplicated or misplaced rows in deputy tabs, while city tabs are the canonical detailed source.

**How to apply:** Build deputy views, totals, filters, and exports by querying normalized city leadership records. Do not seed deputy-tab rows as additional leadership records.