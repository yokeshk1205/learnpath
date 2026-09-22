# Final Content-Coverage Gate

Run the read-only report against the configured database:

```powershell
node --env-file=.env.local scripts/audit-content-coverage.ts --strict
```

The strict gate fails when any active recommendable skill lacks a valid primary lesson, diagnostic question,
practice question, or post-lesson assessment; when fewer than five active courses exist; or when fewer than
five demo learners are seeded.

Final live result:

| Gate | Result |
| --- | ---: |
| Active global skills | 36 |
| Active courses | 5 |
| Required prerequisite edges | 72 |
| Demo profiles | 5 |
| Valid lesson coverage | 36/36 |
| Diagnostic coverage | 36/36 |
| Practice coverage | 36/36 |
| Post-lesson assessment coverage | 36/36 |
| Actionable Learn Next coverage | 36/36 |

All active questions have at least two options, exactly one correct option, a non-empty prompt, and a
non-empty explanation. The integration suite independently asserts these invariants against PostgreSQL.
