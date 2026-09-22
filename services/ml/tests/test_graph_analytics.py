import pytest

from app.graph.schemas import GraphAnalyticsRequest
from app.graph.service import analyze_graph


def request_payload() -> GraphAnalyticsRequest:
    return GraphAnalyticsRequest.model_validate({
        "nodes": [
            {"skill_id": "arrays", "name": "Arrays", "status": "UNLOCKED", "is_context_skill": True},
            {"skill_id": "queues", "name": "Queues", "status": "LOCKED", "is_context_skill": True},
            {"skill_id": "bfs", "name": "BFS", "status": "LOCKED", "is_context_skill": True},
        ],
        "edges": [
            {"prerequisite_skill_id": "arrays", "skill_id": "queues", "required_mastery": 0.7, "relationship_type": "REQUIRED", "satisfied": False},
            {"prerequisite_skill_id": "queues", "skill_id": "bfs", "required_mastery": 0.7, "relationship_type": "REQUIRED", "satisfied": False},
        ],
    })


def test_computes_gateway_and_counterfactual_unlocks() -> None:
    result = analyze_graph(request_payload())
    arrays = next(item for item in result.nodes if item.skill_id == "arrays")

    assert result.engine == "networkx"
    assert result.is_dag is True
    assert result.critical_path == ["arrays", "queues", "bfs"]
    assert arrays.downstream_skill_count == 2
    assert [item.skill_id for item in arrays.unlockable_skills] == ["queues"]
    assert result.bottlenecks[0].skill_id == "arrays"


def test_rejects_a_cycle() -> None:
    payload = request_payload().model_copy(deep=True)
    payload.edges.append(payload.edges[0].model_copy(update={
        "prerequisite_skill_id": "bfs", "skill_id": "arrays",
    }))

    with pytest.raises(ValueError, match="acyclic"):
        analyze_graph(payload)
