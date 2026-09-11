---
name: Personal WhatsApp sharing
description: The campaign uses user-confirmed WhatsApp deep links for personal-number sharing instead of unofficial automation or WhatsApp Business.
---

Personal WhatsApp delivery must stay user-confirmed: the app formats the task and opens a `wa.me` link, while Leonardo presses send in WhatsApp. Do not store personal WhatsApp session credentials or automate a personal account.

**Why:** The requested sender is an administrator's personal number, which has no supported server-side API path and should not be automated through unofficial WhatsApp Web methods.

**How to apply:** Keep task sharing as a manual action from the Kanban, normalize only the recipient phone for the link, and treat actual delivery as outside the application's control.