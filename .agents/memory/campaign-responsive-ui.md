---
name: Campaign responsive UI
description: Durable interaction rules for the campaign spreadsheet and responsive navigation.
---

The Planilha screen must remain a read-only spreadsheet-style grid on every viewport, with source row numbers, column letters, sticky headers/gutter, and deliberate inner scrolling. Do not replace rows with cards on mobile.

**Why:** The source spreadsheet’s original row-and-column structure is important for operational checking and must remain visually recognizable.

**How to apply:** Preserve spreadsheet semantics in future Planilha changes. On desktop, keep the sidebar collapsible with hover/focus labels in compact mode; on mobile, always provide a full-width labeled drawer regardless of the saved desktop state.