# Cloudflare R2, DNS, and TLS

## R2

Create the production bucket and API token in Cloudflare, then store the resulting account ID, access key ID, secret access key, and bucket name as server-only deployment secrets. The application uses presigned object URLs so browsers do not receive R2 credentials.

Configure bucket CORS for the deployed `NEXT_PUBLIC_APP_URL` origin and the methods used by the app (`GET`, `HEAD`, and `PUT`), with only the headers required by the upload flow. Keep the bucket private; public album access is mediated by application responses and short-lived presigned reads.

R2 reconciliation only inspects keys under `events/<event-id>/`. Review its dry-run JSON report before using `--apply`. Keep provider object versioning/retention and backups enabled according to the production account policy.

## DNS and TLS

Point the application hostname at the Cloudways-provided origin using the provider-recommended DNS record. Use Cloudflare proxying only after the origin is healthy, configure Full (strict) TLS, and verify the origin certificate. Do not cache authenticated or presigned responses; cache only explicitly public, immutable assets.

After DNS or TLS changes, verify the canonical HTTPS URL, redirect behavior, CORS origin, and CSP headers from a reachable target. A smoke report with no HTTP response is a failed/unreachable check, not evidence of success.

## Key rotation

Create replacement R2 credentials, deploy them, verify a test upload/read, then revoke the old credentials. Record the time and operator in the incident/change log without recording secret values.
