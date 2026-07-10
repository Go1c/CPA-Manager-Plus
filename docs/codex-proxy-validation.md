# Codex Proxy Validation Before Auth-file Save

CPA Manager requires a server-side CLIProxyAPI proxy test before it saves a changed Codex `proxy_url`.

## Save flow

1. The web editor builds the proxy URL from structured scheme, host, port, username, and password fields. Reserved credential characters are percent-encoded automatically.
2. The browser sends the candidate fields and auth-file name to `POST /v0/management/auth-files/proxy-save` on Manager Server.
3. Manager Server calls CLIProxyAPI `POST /v0/management/proxy/test` from the server network.
4. Only a successful test is followed by `PATCH /v0/management/auth-files/fields`.
5. A failed test returns the structured stage/code/timing result without issuing the patch, so the original auth file remains unchanged.
6. CLIProxyAPI persists the validated update with atomic replacement before publishing it to the runtime auth registry.

The UI disables duplicate save actions while the test is running, retains the candidate input after failure, and displays the failure stage, proxy-connect time, TLS-handshake time, first-byte time, total time, and Cloudflare exit POP. The advanced raw URL field remains available, but the structured fields are preferred.

The Codex auth-file editor also provides a **Test proxy** button. It tests the current unsaved proxy fields without changing the auth file. Saving a changed proxy still runs the required server-side test again, so editing the candidate after a successful manual test cannot bypass validation.

An empty proxy is accepted only when CLIProxyAPI allows direct Codex traffic. When CLIProxyAPI has `codex-proxy-required: true`, the server rejects an empty or direct candidate. Enabling a disabled Codex credential is also guarded by CLIProxyAPI's real proxy test.

## Manager API

```http
POST /v0/management/auth-files/proxy-save
Content-Type: application/json

{
  "name": "codex-example.json",
  "provider": "codex",
  "fields": {
    "proxy_url": "socks5://example-user:<percent-encoded-password>@proxy.example.com:1080",
    "prefix": "team-a"
  }
}
```

Successful response:

```json
{
  "status": "ok",
  "proxy_test": {
    "ok": true,
    "code": "proxy_test_ok",
    "proxy": "socks5://redacted@proxy.example.com:1080",
    "target_status": 401,
    "cloudflare_pop": "EWR",
    "timings_ms": {
      "proxy_connect": 42,
      "tls_handshake": 51,
      "first_byte": 130,
      "total": 131
    }
  }
}
```

CLIProxyAPI test failures are passed through as structured non-2xx responses. Manager Server never includes the candidate password in its own error text.

## Upgrade procedure

1. Upgrade CLIProxyAPI first so `/v0/management/proxy/test` and strict Codex transport behavior are available.
2. Keep CLIProxyAPI `codex-proxy-required: false` during compatibility verification.
3. Upgrade CPA Manager Server and web assets together.
4. Test one non-production Codex auth-file edit and confirm the test result appears before the saved state refreshes.
5. Verify a malformed SOCKS5 URL is rejected and the original file checksum is unchanged.
6. After every required proxy is verified, enable strict mode through a separately reviewed CLIProxyAPI configuration change.

## Rollback

1. Roll back CPA Manager Server and web assets to the previous matching release.
2. Keep CLIProxyAPI's fail-closed transport in place when possible; it protects credentials even if an older UI accepts malformed input.
3. If the CLIProxyAPI release must also be rolled back, set `codex-proxy-required: false` only through the normal reviewed configuration process and restore the previous binary or image.
4. Do not rewrite auth files, restart production containers, or deploy images as part of code review. Perform those actions only after human approval.
