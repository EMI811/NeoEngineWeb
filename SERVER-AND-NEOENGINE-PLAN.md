# NeoCorp — server changes before real public publishing

## 1. Protect neocorp-api
The browser sends `Authorization: Bearer <Firebase ID token>`.
The Worker must verify that token server-side before any write.

Validate:
- RS256 signature against Google's current Firebase Secure Token public keys
- `exp` is future
- `iat` is past
- `aud` = `neoengine-d7ead`
- `iss` = `https://securetoken.google.com/neoengine-d7ead`
- non-empty `sub`; use it as the UID

Cache Google's keys according to their Cache-Control max-age.
Missing/invalid token => HTTP 401.

## 2. Fix CORS
Development may allow the Live Server origin.
Production should allow only NeoCorp's real web origins.
Add `Authorization` to `Access-Control-Allow-Headers`.

## 3. Make Developer a trusted role
Do not authorize uploads from a `developer` field that the same client can edit.
Use either:
- Firebase custom claims set only by an Admin SDK/server, or
- a server-owned role record clients cannot write.

Worker checks the trusted role. UI checks are presentation only.

## 4. Change RTDB ownership
Recommended conceptual structure:

users/<uid>/profile
roles/<uid>                 # server/admin writes only
assets/<assetId>            # public read, server publish/update
userLibraries/<uid>/<assetId>

Users may edit safe profile fields, never roles.
Published asset metadata should be written by the API.

## 5. Real publishing API
Suggested flow:

POST /v1/assets
- authenticate
- require Developer
- validate metadata
- generate assetId

POST /v1/assets/<assetId>/file
- authenticate
- verify ownership
- validate size/type
- store at:
  assets/<uid>/<assetId>/source/<safeFilename>

POST /v1/assets/<assetId>/publish
- authenticate
- verify ownership
- ensure source exists
- publish metadata to RTDB

Never accept an arbitrary UID or R2 key from the browser.

## 6. Downloads
GET /v1/assets/<assetId>/download
- verify asset is published
- resolve the R2 key server-side
- stream/redirect to the file
- optionally record download analytics

## 7. NeoEngine installer
The HTML is already wired to:
`downloads/NeoEngine-Setup.exe`

For local development, put the real installer at that path.

For production, use a stable endpoint such as:
`/v1/releases/neoengine/windows/latest`
which resolves the latest signed installer from R2/CDN. Then releases can change without editing the website.

## 8. Email
Keep Firebase for verification/password reset first.
Before public launch:
- brand Firebase templates
- configure owned domain/action links when available
- add transactional email from the backend for security and publishing events
- keep all mail-provider secrets server-side

Useful emails:
- Verify NeoID
- Password reset
- Security-sensitive account change
- Asset published/rejected
- Important developer/account notices

Do not email for routine clicks.

## 9. Operational requirements
Before public uploads:
- upload file-type allowlist
- max file sizes
- rate limiting
- structured API errors
- request IDs/logging
- delete/update ownership checks
- staging vs production
- metadata backup/export strategy
- Terms, Privacy, Contact/Support pages

## 10. Then NeoEngine becomes the priority
After the secure Web → API → R2 → RTDB → Library loop works:

1. Freeze the NeoCloud/API contract.
2. NeoID sign-in/session inside NeoEngine.
3. Native NeoEngine Library client.
4. Download/import assets into projects.
5. Creator Engine project + viewport foundation.
6. Shared project/assets system across editors.
7. RHI/rendering architecture + contextual resource manager.
8. Connect Form Creator, ScriptStudio, Animation Studio, Cut Motion, Creative Process and PixelStage.
9. Build packaging/update infrastructure.
10. Generate/sign the real NeoEngine installer and publish it through the release endpoint.

That gives:
NeoCorp Web -> NeoCloud -> NeoEngine
rather than three disconnected prototypes.
