# ADR-0010: Do not render repository READMEs

*Status:* accepted · *Date:* 2026-10-24

**Context.** README content would make detail pages richer. It also costs one extra API request **per
repository per cache window** (README contents endpoint), and rendering Markdown to HTML means shipping a
Markdown pipeline plus a sanitiser — a significantly larger XSS surface fed by untrusted content, on a
site whose quota is 60 requests/hour without a token.

**Decision.** No README fetching or Markdown rendering in v1. Detail pages present validated metadata and a
prominent link to the GitHub repository, which is the canonical, always-current presentation of the README.

**Consequences.** (+) Lower quota use, smaller attack surface, no sanitisation dependency, no HTML injection
path at all. (−) Less rich detail pages. Revisit only with an authenticated token and a strict
sanitising pipeline (backlog P22).
