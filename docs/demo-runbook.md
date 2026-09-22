# Panel Demo Runbook

## Start and reset

From the repository root:

```powershell
npm install
node --env-file=.env.local scripts/migrate.ts
npm run build
node --env-file=.env.local scripts/seed-demo-profiles.ts
```

Start PostgreSQL, the API on port 4000, the web app on port 5173, and the ML service on port 8000 using the
local setup in the README. Confirm `/health/ready` for both API and ML before presenting. Run
`npm run content:check` when `DATABASE_URL` is already exported, or call the audit script with
`--env-file=.env.local` as shown in the content report.

All demo accounts use `LearnPathDemo!2026`. The login screen fills and signs in each synthetic profile with
one click.

## Recommended eight-minute panel flow

1. Select **Maya Explorer**. Show five courses, honest empty mastery, and the enroll → diagnostic → path flow.
2. Select **Noah Starter**. Show that no path appears before diagnostic evidence and begin the knowledge check.
3. Select **Aisha Builder**. Explain the Functions gap, the +40-point assessed outcome in `/analytics`, and the
   dashboard CTA **Update my path**. Open the path, show the preserved stale version, regenerate, and show the
   version comparison.
4. From Aisha's fresh path, accept Learn Next, open the specialized Functions lesson, complete it, answer
   practice, then open the separate post-lesson assessment. Emphasize that lesson completion never changes
   mastery; only assessed evidence does.
5. Select **Ravi Strategist**. Show Algorithms recommending Basic Sorting while 20 foundations are recognized
   from prior global evidence. Point out shared Arrays and Strings across two courses.
6. Select **Elena Navigator**. Show two stale paths, the coordinated update CTA, and retention reviews caused by
   older evidence.
7. Open **Reviewer and research tools**. Show graph-first candidate filtering, the deployed Random Forest and
   55-feature provenance, then `/governance` where tiny-sample conclusions are correctly withheld.

## One-sentence architecture explanation

LearnPath maintains one evidence-based global learner model, filters candidates through prerequisite and
retention rules, uses the deployed ML model only to rank eligible candidates, persists an enrollment-specific
path, observes later assessed outcomes, and marks affected paths stale for explicit regeneration.

## Recovery

If a demo profile was changed during rehearsal, rerun `node --env-file=.env.local scripts/seed-demo-profiles.ts`.
The script resets only the five exact demo accounts and refuses to run in production.
