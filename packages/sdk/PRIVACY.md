# Privacy & Data Collection Policy

> **Browsonic SDK** (`@browsonic/sdk`)  
> Version: 2.2.1  
> Last Updated: May 2026

---

## Overview

Browsonic SDK is designed with **privacy-first principles**. This document explains exactly what data is collected, how it's processed, and what safeguards are in place to protect user privacy.

---

## Data Collection Summary

| Data Type        | Collected    | Stored As             | Purpose   |
| ---------------- | ------------ | --------------------- | --------- |
| Error messages   | ✅ Yes       | Full text             | Debugging |
| Stack traces     | ✅ Yes       | Full text             | Debugging |
| Console logs     | ✅ Yes       | Full text             | Context   |
| Network URLs     | ✅ Yes       | Full URL              | Context   |
| Page URLs        | ✅ Yes       | Full URL              | Context   |
| User clicks      | ⚠️ Optional  | Element info only     | Context   |
| User inputs      | ⚠️ Optional  | Pattern + length only | Context   |
| Input values     | ❌ **Never** | N/A                   | N/A       |
| Passwords        | ❌ **Never** | N/A                   | N/A       |
| PII (by default) | ❌ No        | Redacted              | Privacy   |

---

## Visitor Interaction Tracking

### What IS Collected

When `trackVisitor: true` is enabled, the SDK collects:

#### Click Events

```typescript
{
  action: 'click',
  element: {
    tag: 'button',           // HTML tag name
    attributes: {
      id: 'submit-btn',      // Element ID (if present)
      class: 'btn primary',  // CSS classes (if present)
      type: 'submit',        // Input type (if applicable)
      name: 'submitForm',    // Element name (if present)
    }
  }
}
```

#### Input Events

```typescript
{
  action: 'input',
  element: {
    tag: 'input',
    attributes: {
      id: 'email-field',
      type: 'email',
      name: 'userEmail',
      placeholder: 'Enter email'
    },
    value: {
      length: 16,              // Character count only
      pattern: 'email'         // Pattern type only
    }
  }
}
```

### What is NEVER Collected

| Data                    | Example               | Stored?      |
| ----------------------- | --------------------- | ------------ |
| Actual input values     | `john@example.com`    | ❌ **Never** |
| Password field content  | `MyP@ssw0rd123`       | ❌ **Never** |
| Credit card numbers     | `4111-1111-1111-1111` | ❌ **Never** |
| Social security numbers | `123-45-6789`         | ❌ **Never** |
| Any typed text          | `Hello world`         | ❌ **Never** |

### Value Pattern Detection

Instead of storing actual values, the SDK detects the **pattern type**:

| Pattern        | Example Input      | What's Stored                            |
| -------------- | ------------------ | ---------------------------------------- |
| `empty`        | `` (nothing)       | `{ length: 0, pattern: 'empty' }`        |
| `email`        | `user@example.com` | `{ length: 16, pattern: 'email' }`       |
| `numeric`      | `12345`            | `{ length: 5, pattern: 'numeric' }`      |
| `alpha`        | `Hello`            | `{ length: 5, pattern: 'alpha' }`        |
| `alphanumeric` | `User123`          | `{ length: 7, pattern: 'alphanumeric' }` |
| `whitespace`   | `   ` (spaces)     | `{ length: 3, pattern: 'whitespace' }`   |
| `characters`   | `Hello, World!`    | `{ length: 13, pattern: 'characters' }`  |

### Password Field Protection

Password fields (`<input type="password">`) are **completely skipped**:

```typescript
// This input is NEVER tracked
<input type="password" id="user-password" />

// SDK behavior:
if (element.type === 'password') {
  return; // Skip entirely - no data collected
}
```

---

## Sensitive Data Redaction

### Default Redacted Keys

The following keys are automatically redacted in localStorage, sessionStorage, cookies, and user context:

```typescript
const DEFAULT_REDACT_KEYS = [
  'token',
  'password',
  'authorization',
  'secret',
  'key',
  'credential',
  'auth',
];
```

### Example Redaction

```javascript
// Original localStorage
{
  "authToken": "eyJhbGciOiJIUzI1NiIs...",
  "userName": "John Doe",
  "sessionPassword": "abc123"
}

// What SDK collects
{
  "authToken": "***",        // Redacted (contains 'auth' and 'token')
  "userName": "John Doe",    // Not redacted
  "sessionPassword": "***"   // Redacted (contains 'password')
}
```

### Custom Redaction

You can add custom keys to redact:

```typescript
sdk.init({
  redactKeys: [...DEFAULT_REDACT_KEYS, 'ssn', 'creditCard', 'bankAccount'],
  redactCookieNames: ['session_id', 'csrf_token'],
});
```

---

## Configuration Defaults

### Privacy-Safe Defaults

| Setting                  | Default | Description                                                            |
| ------------------------ | ------- | ---------------------------------------------------------------------- |
| `trackVisitor`           | `false` | Visitor tracking is **OFF by default**                                 |
| `trackNavigation`        | `true`  | URL changes only, no user data                                         |
| `networkTelemetry`       | `true`  | URLs only, no request/response bodies                                  |
| `captureAsyncStack`      | `false` | Performance impact, opt-in (values: `false` / `'manual'` / `'global'`) |
| `captureStorage.local`   | `false` | `localStorage` capture **OFF** since 0.3.0 (was ON in 0.2.x)           |
| `captureStorage.session` | `false` | `sessionStorage` capture **OFF** since 0.3.0                           |
| `captureCookieValues`    | `false` | Cookie **values** redacted; only names are listed                      |
| `internalDiagnostics`    | `false` | SDK self-metrics reporting is OFF; opt in for fleet observability      |

### Enabling Visitor Tracking

Visitor tracking must be explicitly enabled:

```typescript
sdk.init({
  trackVisitor: true, // Must be explicitly set
  visitor: {
    click: true, // Track clicks
    input: true, // Track inputs (patterns only)
    inputThrottleMs: 500, // Throttle to reduce data
  },
});
```

### Storage + cookie handling

Since **0.3.0** the SDK captures **no storage values and no cookie values
by default**. Only the `keys`/`names` are attached to events so that
operators can answer _"was the user logged in at the time of the
error?"_ without ever seeing the token itself.

- `captureStorage.local` / `captureStorage.session` — when enabled,
  the SDK captures the first `maxEntries` (default 50) key/value
  pairs. Values still go through `redactKeys` matching, so anything
  that looks like a token/password/secret is masked automatically.
- `captureCookieValues` — when disabled (default), `document.cookie`
  is parsed to a **names-only list** attached as `sessionContext.cookies`.
  When enabled, values are captured and passed through the same redaction
  pipeline.
- `redactCookieNames` — an **additional** allow-list of cookie names
  to mask regardless of the value content (useful for
  tenant-specific session cookie names).

Example: temporarily enable storage capture in staging for debugging,
leave cookies opaque:

```typescript
sdk.init({
  environment: process.env.NODE_ENV,
  captureStorage:
    process.env.NODE_ENV !== 'production'
      ? { local: true, session: true, maxEntries: 50 }
      : undefined,
  captureCookieValues: false, // stay opaque even in staging
  redactCookieNames: ['sid', 'csrf_token', 'analytics_id'],
});
```

#### GDPR / KVKK mapping

| Default                        | GDPR / KVKK category   | Why safe                                                   |
| ------------------------------ | ---------------------- | ---------------------------------------------------------- |
| `trackVisitor: false`          | Behavioural tracking   | No cookie / ID until the host app explicitly opts in       |
| `captureStorage.*: false`      | Terminal-based data    | No storage contents leave the browser without opt-in       |
| `captureCookieValues: false`   | Authentication tokens  | Cookie VALUES stay on the browser; only names are reported |
| `networkTelemetry` (URLs only) | Communication metadata | No request/response bodies, no auth headers                |

These defaults let host apps ship the SDK to production **without**
running a new data-processing review — the SDK only observes what is
already public (URLs, navigation, error messages). Enabling any of the
opt-in captures above requires the host app's existing privacy
framework to sign off.

---

## Network Request Handling

### What IS Collected

```typescript
{
  method: 'POST',
  url: 'https://api.example.com/users',
  statusCode: 200,
  statusText: 'OK',
  duration: 145,  // milliseconds
  type: 'fetch'   // or 'xhr'
}
```

### What is NEVER Collected

- Request headers (may contain auth tokens)
- Request body (may contain user data)
- Response headers
- Response body

### SDK Endpoint Filtering

Requests to the SDK's own endpoint are automatically filtered to prevent infinite loops:

```typescript
// These requests are NOT recorded in telemetry
fetch('http://your-browsonic-server.com/v1/events', ...)
```

---

## User Context Handling

### Safe User Context

```typescript
sdk.setUser({
  id: 'user-123', // Safe: identifier only
  email: 'user@example.com', // Safe: explicit consent assumed
  plan: 'premium', // Safe: non-sensitive metadata
});
```

### Automatic Redaction

Sensitive fields in user context are automatically redacted:

```typescript
sdk.setUser({
  id: 'user-123',
  authToken: 'secret-token',  // Will be redacted to '***'
  password: 'mypassword'      // Will be redacted to '***'
});

// Stored as:
{
  id: 'user-123',
  authToken: '***',
  password: '***'
}
```

---

## Compliance

### GDPR Compliance

| Requirement        | Implementation                                    |
| ------------------ | ------------------------------------------------- |
| Data minimization  | Only patterns/lengths stored, never actual values |
| Purpose limitation | Data used only for error debugging                |
| Right to erasure   | Contact your Browsonic administrator              |
| Consent            | `trackVisitor: false` by default                  |

### CCPA Compliance

| Requirement      | Implementation                              |
| ---------------- | ------------------------------------------- |
| Right to know    | This document describes all data collection |
| Right to delete  | Contact your Browsonic administrator        |
| Right to opt-out | Disable tracking via configuration          |

### HIPAA Considerations

For healthcare applications:

- Keep `trackVisitor: false`
- Add PHI-related terms to `redactKeys`
- Review all localStorage/sessionStorage keys

---

## Recommendations by Industry

### E-Commerce

```typescript
sdk.init({
  trackVisitor: true, // Helpful for checkout debugging
  visitor: {
    click: true,
    input: true,
  },
  redactKeys: [...DEFAULT, 'cardNumber', 'cvv', 'expiry'],
});
```

### Healthcare

```typescript
sdk.init({
  trackVisitor: false, // Disable for PHI protection
  redactKeys: [...DEFAULT, 'patientId', 'diagnosis', 'medication'],
});
```

### Finance

```typescript
sdk.init({
  trackVisitor: true,
  visitor: {
    click: true,
    input: false, // Disable input tracking
  },
  redactKeys: [...DEFAULT, 'accountNumber', 'routingNumber', 'ssn'],
});
```

---

## Verification

### Inspect Collected Data

Enable debug mode to see exactly what's being collected:

```typescript
sdk.init({
  debug: true, // Logs all collected data to console
  // ...
});
```

### Network Tab Inspection

You can inspect the actual payloads sent to your Browsonic server:

1. Open DevTools → Network tab
2. Filter by your Browsonic endpoint
3. Inspect the request payload
4. Verify no sensitive data is present

---

## Questions?

If you have privacy concerns or questions about data collection:

1. Review the documentation at [browsonic.com](https://browsonic.com/docs)
2. Enable `debug: true` to inspect collected data
3. Contact: privacy@browsonic.com

---

## Changelog

| Version | Date     | Changes                                                                                                                                                   |
| ------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.2.1   | May 2026 | Current release                                                                                                                                           |
| 2.0.0   | Apr 2026 | Plugin architecture; `internalDiagnostics`, `onUnsupportedVersion`, `cspNonce`, `visitorIdStrategy`, `respectGPC`, `hasConsented`, Set-based `redactKeys` |
| 0.3.0   | Mar 2026 | BREAKING — `captureStorage` + `captureCookieValues` default **false**; names-only cookie capture; `redactCookieNames` added                               |
| 0.2.0   | Feb 2026 | Added visitor tracking with privacy-safe defaults                                                                                                         |
| 0.1.0   | Jan 2026 | Initial release with basic error tracking                                                                                                                 |
