# Knowledge Graph v2

Knowledge Graph v2 is a hybrid prerequisite-intelligence layer. It preserves one authoritative source of
truth while using specialized tools for the jobs they are best suited to perform.

## Architecture

```text
PostgreSQL curriculum graph + global learner skill state
                         |
                         v
TypeScript prerequisite engine (authoritative safety gate)
  - required-edge validation
  - confidence-adjusted mastery
  - locked / unlocked / mastered classification
                         |
                         v
NetworkX analytics (derived structural intelligence)
  - topological layers
  - downstream reach
  - betweenness centrality
  - shortest foundation route
  - bottlenecks and counterfactual unlocks
                         |
                         v
Eligible candidate pool only
                         |
                         v
Random Forest benefit probability + bounded graph bonus
                         |
                         v
Dependency-safe personalized path and learner explanation
```

PostgreSQL remains the source of truth for skills, course mappings, prerequisite edges, enrollment context,
global mastery, confidence, evidence, and retention. Neo4j is intentionally not introduced because the
current graph fits the relational curriculum model and is already protected by database constraints and
cycle prevention. Adding a second authoritative graph store would create synchronization and operational
risk without improving the present learner decision.

## Confidence-aware prerequisite gate

A required prerequisite is evaluated with a conservative confidence buffer:

```text
uncertainty_penalty = (1 - confidence) x 0.10
effective_mastery = max(0, observed_mastery - uncertainty_penalty)
gate_satisfied = effective_mastery >= edge_required_threshold
```

For example, observed mastery `0.73` with confidence `0.40` receives a `0.06` uncertainty penalty, producing
effective mastery `0.67`. A `0.70` prerequisite therefore remains locked until stronger evidence arrives.
When confidence is unavailable, the engine keeps the legacy raw-mastery behavior for backward compatibility.

Only the TypeScript engine can decide whether a required edge is satisfied. NetworkX and the ML model cannot
override this decision.

## NetworkX analytics

The application sends a request-scoped, read-only graph projection to `POST /graph/analyze`. NetworkX first
validates that the required-edge graph is a directed acyclic graph, then computes:

- topological generation for the learner-facing dependency layers;
- descendants and direct dependents for downstream reach;
- betweenness centrality for structural bridge importance;
- a shortest path from a root prerequisite to each skill;
- the graph critical path;
- currently locked descendants for bottleneck detection; and
- counterfactual unlocks: locked skills that would become ready if one selected prerequisite reached its
  required threshold while all other required gates remained satisfied.

The bounded gateway score is:

```text
gateway_score =
    0.50 x descendant_ratio
  + 0.30 x normalized_betweenness
  + 0.20 x immediate_counterfactual_unlock_ratio
```

Every component is bounded to `[0, 1]`. The result explains which foundations have the greatest structural
leverage; it does not claim that centrality alone predicts learning benefit.

## Ranking boundary

Locked skills are removed before feature construction and ML inference. For each eligible candidate:

```text
path_priority =
    random_forest_benefit_probability
  + 0.08 when retention revision is due
  + 0.06 x networkx_gateway_score
```

The graph contribution is deliberately capped at `0.06`. This means structural leverage can break a close
recommendation decision but cannot dominate the learned benefit probability. A NetworkX result can never
add a locked skill to the candidate pool.

If the analytics service is unavailable or returns an incompatible version, the API returns the complete
TypeScript prerequisite result in safe mode. Required gates continue to work and the graph bonus is omitted.

## Learner-facing demonstration

The `/prerequisites` page uses live API data and provides:

- course-specific projections over the same global learner knowledge;
- required and recommended edge styles;
- mastered, ready, and locked nodes;
- confidence-adjusted mastery versus the exact target;
- dependency layers, shortest foundation routes, and downstream reach;
- graph bottlenecks and gateway scores;
- counterfactual skills that would unlock next; and
- exact explanations for every failed or satisfied gate.

The personalized-path page links its current recommendation back to this graph context. After assessed
evidence changes mastery or confidence, current paths become stale; regeneration reruns prerequisite gating,
NetworkX enrichment, candidate construction, Random Forest inference, and dependency-aware path ordering.

## Verification

The implementation is covered by Python graph tests, TypeScript prerequisite and path tests, API client
validation, full API/web type-checking and linting, production builds, and live browser verification against
the seeded multi-course learner profile.
