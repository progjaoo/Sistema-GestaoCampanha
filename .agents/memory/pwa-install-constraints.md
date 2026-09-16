---
name: PWA install constraints
description: Browser limitations that shape the campaign app's installation and sharing flow.
---

A shared URL cannot force the operating system to install a PWA or automatically click “Add to Home Screen”. Android/Chrome may expose `beforeinstallprompt`, but the native prompt still requires a user gesture; iOS Safari always requires the user to use Share → Add to Home Screen.

**Why:** Browser and operating-system security policies prevent websites from silently installing apps or simulating privileged browser-menu actions.

**How to apply:** Share a public installation route that works before login, calls the native prompt from an explicit button when available, and gives platform-specific fallback instructions otherwise.