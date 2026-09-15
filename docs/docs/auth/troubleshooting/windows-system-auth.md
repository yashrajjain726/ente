---
title: Windows system authentication
description: Troubleshoot Windows authentication prompts in Ente Auth
---

# Windows System Authentication

Ente Auth uses Windows Hello when an action requires system authentication.

If Ente Auth asks you to authenticate but Windows does not display a security
prompt:

1. Open **Windows Settings → Accounts → Sign-in options**.
2. Verify that your Windows Hello PIN is configured and works.
3. If Windows reports a PIN as configured but it does not work, use the Windows
   PIN recovery options to reset or recreate it.
4. Restart Ente Auth and try again.
