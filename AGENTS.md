# Project instructions

## Code contracts by default

Apply the `code-contracts` skill to all future development in this repository,
including new features, bug fixes, refactors, and code reviews, without requiring
the user to invoke it again. Read and follow
[/Users/nshah/.codex/skills/code-contracts/SKILL.md](/Users/nshah/.codex/skills/code-contracts/SKILL.md).
If that path is unavailable, look for the installed `code-contracts` skill and
retain the following requirements:

- Before choosing a technical design or changing code, discover applicable local,
  enclosing-declaration, and ancestor `CONTRACTS` obligations. Inspect contracts
  on called symbols as well.
- Introduce relevant `@cc` contracts for new behavior. Backfill missing contracts
  when the change relies on material assumptions about existing code.
- Keep each contract concise and observable, covering one concrete obligation
  and its decisive error, fallback, or side-effect cases. Use the narrowest
  declaration or directory boundary; do not merely restate the implementation.
- Put each declaration contract in its own supported documentation comment or
  docstring. Put directory-wide obligations in `CONTRACTS`. Keep contract IDs
  stable and unique within their declaration, or within their `CONTRACTS` file
  and its ancestor `CONTRACTS` files.
- Set `owner` to the user's authenticated GitHub username when available; ask
  rather than guess if it cannot be determined. Add `notify` only when explicitly
  requested. Preserve established repository metadata conventions.
- Update contracts in the same change as intentional behavior changes and check
  affected consumers. Reconcile implementation, relevant tests, and contract
  prose after each meaningful change. Never weaken or delete a contract merely
  to hide a mismatch; fix or clearly surface violations and contradictions.
- Validate syntax with `cc-check format` and discoverability with `cc-check list`
  for the affected source files or locations. These checks do not establish
  semantic compliance; verify that separately. If tooling is unavailable,
  inspect manually and disclose the verification limit.
- For explicit contract verification or review requests, follow the skill's
  read-only verification procedure unless edits are separately authorized.

## Browser preference

Prefer Obscura for browser automation, using its MCP tools when available. The
local binary is `/Users/nshah/.local/share/obscura/v0.2.2/obscura`; it can also be
used through its CLI or CDP server when appropriate.

Use Chrome or the built-in browser tools as a fallback when Obscura cannot
complete the task, when Chromium-specific behavior or visual verification is
required, or when the task needs an existing signed-in browser session. Follow
an explicit user choice of browser. This preference does not replace built-in
web search or purpose-built app connectors.

For local development targets only, use Obscura's `--allow-private-network`
option as needed. Keep this option off for general web browsing.
