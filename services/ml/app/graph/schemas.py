from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class GraphNode(BaseModel):
    model_config = ConfigDict(extra="forbid")

    is_context_skill: bool
    name: str
    skill_id: str
    status: Literal["LOCKED", "MASTERED", "UNLOCKED"]


class GraphEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    prerequisite_skill_id: str
    relationship_type: Literal["RECOMMENDED", "REQUIRED"]
    required_mastery: float = Field(ge=0, le=1)
    satisfied: bool
    skill_id: str


class GraphAnalyticsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    edges: list[GraphEdge]
    nodes: list[GraphNode]


class UnlockableSkill(BaseModel):
    required_mastery: float
    skill_id: str
    skill_name: str


class GraphNodeAnalytics(BaseModel):
    betweenness_centrality: float
    direct_dependent_count: int
    downstream_skill_count: int
    foundation_route: list[str]
    gateway_score: float
    skill_id: str
    unlockable_skills: list[UnlockableSkill]


class GraphBottleneck(BaseModel):
    blocked_context_skill_count: int
    gateway_score: float
    skill_id: str
    skill_name: str


class GraphAnalyticsResponse(BaseModel):
    analytics_version: str
    bottlenecks: list[GraphBottleneck]
    critical_path: list[str]
    edge_count: int
    engine: Literal["networkx"]
    generated_at: str
    is_dag: bool
    layers: list[list[str]]
    node_count: int
    nodes: list[GraphNodeAnalytics]
