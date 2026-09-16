---
name: Auth user management
description: Safety rules for editing and removing campaign user accounts.
---

Hard-delete accounts only when the database has no dependent operational records; otherwise return a clear conflict and direct administrators to block the account instead.

**Why:** Campaign history must remain intact, and foreign-key references make silent physical deletion unsafe.

**How to apply:** Keep self-block and self-delete protection, require confirmation in the UI before destructive account actions, and offer reactivation as the reversible alternative.