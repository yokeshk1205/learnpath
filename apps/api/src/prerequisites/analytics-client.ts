import { z } from "zod";

import { AppError } from "../errors.js";
import type { GraphAnalyticsClientContract } from "./types.js";

const responseSchema = z.object({
  analytics_version: z.string(),
  bottlenecks: z.array(z.object({
    blocked_context_skill_count: z.number().int().nonnegative(),
    gateway_score: z.number().min(0).max(1),
    skill_id: z.string(),
    skill_name: z.string(),
  })),
  critical_path: z.array(z.string()),
  edge_count: z.number().int().nonnegative(),
  engine: z.literal("networkx"),
  generated_at: z.string(),
  is_dag: z.boolean(),
  layers: z.array(z.array(z.string())),
  node_count: z.number().int().nonnegative(),
  nodes: z.array(z.object({
    betweenness_centrality: z.number().min(0).max(1),
    direct_dependent_count: z.number().int().nonnegative(),
    downstream_skill_count: z.number().int().nonnegative(),
    foundation_route: z.array(z.string()),
    gateway_score: z.number().min(0).max(1),
    skill_id: z.string(),
    unlockable_skills: z.array(z.object({
      required_mastery: z.number().min(0).max(1),
      skill_id: z.string(),
      skill_name: z.string(),
    })),
  })),
});

export function createGraphAnalyticsClient(baseUrl: string, timeoutMs: number): GraphAnalyticsClientContract {
  return {
    async analyze(input) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const response = await fetch(`${baseUrl}/graph/analyze`, {
          body: JSON.stringify({
            edges: input.edges.map((edge) => ({
              prerequisite_skill_id: edge.prerequisiteSkillId,
              relationship_type: edge.relationshipType,
              required_mastery: edge.requiredMastery,
              satisfied: edge.satisfied,
              skill_id: edge.skillId,
            })),
            nodes: input.nodes.map((node) => ({
              is_context_skill: node.isContextSkill,
              name: node.name,
              skill_id: node.skillId,
              status: node.status,
            })),
          }),
          headers: { "content-type": "application/json" },
          method: "POST",
          signal: controller.signal,
        });
        const payload: unknown = await response.json().catch(() => null);
        const parsed = responseSchema.safeParse(payload);
        if (!response.ok || !parsed.success) throw new AppError(
          503,
          "GRAPH_ANALYTICS_UNAVAILABLE",
          "NetworkX graph analytics returned an invalid response.",
        );
        return {
          analyticsVersion: parsed.data.analytics_version,
          bottlenecks: parsed.data.bottlenecks.map((item) => ({
            blockedContextSkillCount: item.blocked_context_skill_count,
            gatewayScore: item.gateway_score,
            skillId: item.skill_id,
            skillName: item.skill_name,
          })),
          criticalPath: parsed.data.critical_path,
          edgeCount: parsed.data.edge_count,
          engine: parsed.data.engine,
          generatedAt: parsed.data.generated_at,
          isDag: parsed.data.is_dag,
          nodeCount: parsed.data.node_count,
          nodes: parsed.data.nodes.map((item) => ({
            betweennessCentrality: item.betweenness_centrality,
            directDependentCount: item.direct_dependent_count,
            downstreamSkillCount: item.downstream_skill_count,
            foundationRoute: item.foundation_route,
            gatewayScore: item.gateway_score,
            skillId: item.skill_id,
            unlockableSkills: item.unlockable_skills.map((skill) => ({
              requiredMastery: skill.required_mastery,
              skillId: skill.skill_id,
              skillName: skill.skill_name,
            })),
          })),
        };
      } catch (error) {
        if (error instanceof AppError) throw error;
        throw new AppError(503, "GRAPH_ANALYTICS_UNAVAILABLE", "NetworkX graph analytics is unavailable.");
      } finally {
        clearTimeout(timeout);
      }
    },
  };
}
