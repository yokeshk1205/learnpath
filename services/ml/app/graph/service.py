from datetime import datetime, timezone

import networkx as nx

from app.graph.schemas import (
    GraphAnalyticsRequest,
    GraphAnalyticsResponse,
    GraphBottleneck,
    GraphNodeAnalytics,
    UnlockableSkill,
)


ANALYTICS_VERSION = "knowledge-graph-v2"


def _rounded(value: float) -> float:
    return round(value, 6)


def _foundation_route(graph: nx.DiGraph, skill_id: str) -> list[str]:
    roots = [node for node, degree in graph.in_degree() if degree == 0]
    paths = [nx.shortest_path(graph, root, skill_id) for root in roots if nx.has_path(graph, root, skill_id)]
    return min(paths, key=lambda path: (len(path), path)) if paths else [skill_id]


def analyze_graph(request: GraphAnalyticsRequest) -> GraphAnalyticsResponse:
    node_by_id = {node.skill_id: node for node in request.nodes}
    graph = nx.DiGraph()
    graph.add_nodes_from(node_by_id)
    for edge in request.edges:
        if edge.prerequisite_skill_id not in node_by_id or edge.skill_id not in node_by_id:
            raise ValueError("Every graph edge must reference nodes in the request.")
        if edge.relationship_type == "REQUIRED":
            graph.add_edge(
                edge.prerequisite_skill_id,
                edge.skill_id,
                required_mastery=edge.required_mastery,
                satisfied=edge.satisfied,
            )
    if not nx.is_directed_acyclic_graph(graph):
        raise ValueError("The required prerequisite graph must be acyclic.")

    centrality = nx.betweenness_centrality(graph, normalized=True)
    descendants = {node: nx.descendants(graph, node) for node in graph.nodes}
    maximum_unlockable = 1
    unlockable_by_skill: dict[str, list[UnlockableSkill]] = {}
    for prerequisite_id in graph.nodes:
        unlockable: list[UnlockableSkill] = []
        for dependent_id in graph.successors(prerequisite_id):
            dependent = node_by_id[dependent_id]
            if dependent.status != "LOCKED":
                continue
            incoming = list(graph.in_edges(dependent_id, data=True))
            if all(source == prerequisite_id or bool(data["satisfied"]) for source, _, data in incoming):
                unlockable.append(UnlockableSkill(
                    required_mastery=float(graph.edges[prerequisite_id, dependent_id]["required_mastery"]),
                    skill_id=dependent_id,
                    skill_name=dependent.name,
                ))
        unlockable.sort(key=lambda item: (item.required_mastery, item.skill_name))
        unlockable_by_skill[prerequisite_id] = unlockable
        maximum_unlockable = max(maximum_unlockable, len(unlockable))

    denominator = max(len(graph.nodes) - 1, 1)
    analytics: list[GraphNodeAnalytics] = []
    for skill_id in graph.nodes:
        descendant_ratio = len(descendants[skill_id]) / denominator
        unlock_ratio = len(unlockable_by_skill[skill_id]) / maximum_unlockable
        gateway_score = 0.50 * descendant_ratio + 0.30 * centrality[skill_id] + 0.20 * unlock_ratio
        analytics.append(GraphNodeAnalytics(
            betweenness_centrality=_rounded(centrality[skill_id]),
            direct_dependent_count=graph.out_degree(skill_id),
            downstream_skill_count=len(descendants[skill_id]),
            foundation_route=_foundation_route(graph, skill_id),
            gateway_score=_rounded(gateway_score),
            skill_id=skill_id,
            unlockable_skills=unlockable_by_skill[skill_id],
        ))
    analytics.sort(key=lambda item: item.skill_id)

    metric_by_id = {item.skill_id: item for item in analytics}
    bottlenecks: list[GraphBottleneck] = []
    for skill_id in graph.nodes:
        blocked = sum(
            1 for dependent_id in descendants[skill_id]
            if node_by_id[dependent_id].is_context_skill and node_by_id[dependent_id].status == "LOCKED"
        )
        if blocked or unlockable_by_skill[skill_id]:
            bottlenecks.append(GraphBottleneck(
                blocked_context_skill_count=blocked,
                gateway_score=metric_by_id[skill_id].gateway_score,
                skill_id=skill_id,
                skill_name=node_by_id[skill_id].name,
            ))
    bottlenecks.sort(key=lambda item: (-item.blocked_context_skill_count, -item.gateway_score, item.skill_name))

    return GraphAnalyticsResponse(
        analytics_version=ANALYTICS_VERSION,
        bottlenecks=bottlenecks[:5],
        critical_path=nx.dag_longest_path(graph),
        edge_count=graph.number_of_edges(),
        engine="networkx",
        generated_at=datetime.now(timezone.utc).isoformat(),
        is_dag=True,
        layers=[sorted(generation) for generation in nx.topological_generations(graph)],
        node_count=graph.number_of_nodes(),
        nodes=analytics,
    )
