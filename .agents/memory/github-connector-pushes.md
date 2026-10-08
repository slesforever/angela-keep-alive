---
name: GitHub connector pushes
description: Reliable way to update this repository through the Replit-managed GitHub connection.
---

When updating this repository through the GitHub connector, use the Git REST reference endpoint with the plural path `/git/refs/heads/main`; the singular `/git/ref/heads/main` can return 404 even when the repository and branch are visible.

**Why:** The connector successfully exposes the repository and branch, but the singular endpoint was rejected during a real push attempt.

**How to apply:** Verify the remote branch SHA before writing, create blobs/tree/commit from the local files, then update the branch ref with `force: false`.