import { afterEach, describe, expect, it, vi } from "vitest";

import { createGraphAnalyticsClient } from "../src/prerequisites/analytics-client.js";

afterEach(() => vi.restoreAllMocks());

describe("NetworkX graph analytics client", () => {
  it("maps checked snake-case analytics into the API contract", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      analytics_version: "knowledge-graph-v2",
      bottlenecks: [{ blocked_context_skill_count: 2, gateway_score: 0.7, skill_id: "a", skill_name: "A" }],
      critical_path: ["a", "b"], edge_count: 1, engine: "networkx",
      generated_at: "2026-09-04T00:00:00Z", is_dag: true, layers: [["a"], ["b"]], node_count: 2,
      nodes: [{
        betweenness_centrality: 0, direct_dependent_count: 1, downstream_skill_count: 1,
        foundation_route: ["a"], gateway_score: 0.7, skill_id: "a",
        unlockable_skills: [{ required_mastery: 0.7, skill_id: "b", skill_name: "B" }],
      }],
    }), { status: 200, headers: { "content-type": "application/json" } }));
    const client = createGraphAnalyticsClient("http://ml", 1_000);

    const result = await client.analyze({
      edges: [{ prerequisiteSkillId: "a", relationshipType: "REQUIRED", requiredMastery: 0.7, satisfied: false, skillId: "b" }],
      nodes: [
        { isContextSkill: true, name: "A", skillId: "a", status: "UNLOCKED" },
        { isContextSkill: true, name: "B", skillId: "b", status: "LOCKED" },
      ],
    });

    expect(result.nodes[0]).toMatchObject({ downstreamSkillCount: 1, gatewayScore: 0.7 });
    expect(result.bottlenecks[0]).toMatchObject({ blockedContextSkillCount: 2 });
  });
});
