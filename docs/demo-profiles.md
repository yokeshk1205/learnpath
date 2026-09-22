# LearnPath demo profiles

The login page provides one-click access to five learner accounts. Every account uses real PostgreSQL state and the normal LearnPath APIs; the cards are not frontend-only personas.

All profiles use the password `LearnPathDemo!2026`.

| Profile | Email | Demonstrates |
| --- | --- | --- |
| Maya Explorer | `maya.explorer@demo.learnpath.local` | Brand-new learner, no enrollments, course discovery, and empty states. |
| Noah Starter | `noah.starter@demo.learnpath.local` | Programming Fundamentals enrollment waiting for its first diagnostic knowledge check. |
| Aisha Builder | `aisha.builder@demo.learnpath.local` | A Functions skill gap, accepted/completed recommendation, lower-weight practice, distinct post-lesson assessment, +40-point observed assessed gain, and a stale path ready to regenerate. |
| Elena Navigator | `elena.navigator@demo.learnpath.local` | Two stale course paths, cross-course reuse, retention risk, one-click regeneration, and a structured declined recommendation. |
| Ravi Strategist | `ravi.strategist@demo.learnpath.local` | Advanced prior knowledge reused across Programming Fundamentals and Algorithms, 20 recognized foundations, and a focused Basic Sorting recommendation. |

## Resetting the demonstration

With the API, ML service, and PostgreSQL running:

```powershell
$env:DATABASE_URL='postgresql://learnpath@127.0.0.1:55432/learnpath'
$env:NODE_ENV='development'
npm run demo:seed
```

The command resets only the five exact `@demo.learnpath.local` accounts listed above. It then registers them through authentication, enrolls courses through the enrollment API, submits real diagnostics, records module/resource activity, recalculates retention, and generates personalized paths through the configured ML inference service. It refuses to run when `NODE_ENV=production`.

Elena's older evidence timestamps are deliberately backdated so retention decay is visible. After both
paths are generated, the seeder submits another real diagnostic; the centralized evidence service updates
mastery and marks both paths stale. Logging in as Elena therefore demonstrates stale-path exclusion,
explicit regeneration, cross-course re-coordination, before/after version history, and a real decline reason.
Aisha accepts and completes the recommended resource with exact path/version metadata, answers a lower-weight
practice question, and completes a separate post-lesson assessment. The assessment creates the later outcome
evidence; practice is excluded from recommendation-outcome gain. `/analytics` displays the observed +40-point
assessed gain with a non-causal disclaimer, while the dashboard pauses the stale recommendation.
