# Security Policy

## Reporting a vulnerability

Please **do not open a public GitHub issue** for security vulnerabilities. Public reports give attackers a head start on every site that ships the SDK before a fix is released.

Instead, choose either of:

1. **GitHub private vulnerability reporting** — go to the Security tab on the repository and click **Report a vulnerability**. This creates a private advisory visible only to maintainers.
2. **Email** — send a report to **emrullahyildirim@windowslive.com**. Use the subject prefix `[browsonic-sdk security]`.

Include in the report:

- A description of the issue and the impact you believe it has.
- A minimal reproduction (HTML page, code snippet, or proof-of-concept).
- The SDK version and browser used.
- Any mitigations or workarounds you have already identified.

## What to expect

| Step                                         | Target time                                                                          |
| -------------------------------------------- | ------------------------------------------------------------------------------------ |
| Acknowledgement of receipt                   | within 3 business days                                                               |
| Initial assessment and severity rating       | within 7 business days                                                               |
| Patch released for confirmed vulnerabilities | depends on severity; critical issues prioritised                                     |
| Public advisory published                    | once a fixed version is on npm and consumers have had a reasonable window to upgrade |

These are targets, not guarantees — this is a maintainer-led project, not a 24/7 operation. Critical issues will get out-of-hours attention; routine issues will not.

## Scope

In scope:

- Code in `src/` that runs in customer browsers.
- The `dist/` build output published to npm.
- The release pipeline and any CI workflow that produces a published artefact.

Out of scope:

- Vulnerabilities in customer applications that arise from misuse of the SDK (for example, a customer storing PII in `appKey`).
- Vulnerabilities in the closed-source Browsonic SaaS backend — report those to the SaaS operator directly.
- Issues that require an attacker to already control the page on which the SDK is loaded; the SDK trusts its own host.

## Coordinated disclosure

We follow standard coordinated disclosure: a fix lands, a patched version ships to npm, and a public advisory follows. Reporters are credited unless they prefer anonymity.

Thank you for helping keep the SDK and its users safe.
