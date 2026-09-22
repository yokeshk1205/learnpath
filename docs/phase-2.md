# Phase 2 — Authentication and user management

## Implemented

- normalized PostgreSQL `users`, `roles`, `user_roles`, and `refresh_sessions` tables
- default `LEARNER` and explicit `ADMIN` role model
- Argon2id password hashing using OWASP-aligned memory and iteration settings
- normalized-email registration with transactional role and session creation
- generic-credential login failures that do not reveal account existence
- short-lived HS256 access tokens with issuer, audience, subject, and role claims
- cryptographically random refresh credentials stored only as SHA-256 hashes
- refresh rotation, replay detection, chain revocation, session expiry, and logout revocation
- HttpOnly, SameSite=Lax refresh cookie and exact-origin CORS/CSRF boundary
- rate limiting on registration and login
- authenticated current-user endpoint and role-gated admin access boundary
- `/login`, `/register`, and protected `/dashboard` frontend routes
- in-memory access credentials and refresh-cookie session restoration

## Endpoints

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/auth/register` | Create an active learner account and session |
| `POST` | `/auth/login` | Verify credentials and create a session |
| `POST` | `/auth/refresh` | Rotate a refresh session and issue a new access token |
| `POST` | `/auth/logout` | Revoke the current refresh session |
| `GET` | `/auth/me` | Return the current active user |
| `GET` | `/admin/access-check` | Verify the ADMIN authorization boundary |

## Security decisions

The browser does not write access tokens to local or session storage. Passwords and raw refresh
credentials are never stored in PostgreSQL. A reused rotated refresh token revokes all active sessions
for that user. The access-token secret is mandatory at application startup and must contain at least
32 characters.

Email verification, password reset, multi-factor authentication, account administration, and external
identity providers are not part of the requested Phase 2 baseline and remain deferred.

