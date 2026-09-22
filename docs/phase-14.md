# Phase 14 — ML Training and Offline Evaluation

Phase 14 answers a narrow but essential question: can LearnPath predict which eligible simulated
learner-skill interactions are likely to be beneficial better than transparent heuristics? It does
not use that prediction in the product yet.

## Experimental protocol

- Source: the corrected Phase 13 `engineered-features-v2` artifact, classified as synthetic/simulated data.
- Features: all 55 inputs in `learner-candidate-features-v2`, in frozen order.
- Split: deterministic seed `42`, grouped by learner at 70% train, 15% validation, 15% test.
- Learners: 700 train, 150 validation, 150 test; overlap is required to be zero.
- Rows: 14,000 train, 3,000 validation, 3,000 test.
- Selection: highest validation NDCG@5, then validation ROC-AUC and F1 as tie-breakers.
- Threshold: chosen on the validation group for F1; the test group never changes the choice.

## Predictors and baselines

The training run fits Gradient Boosting, Random Forest, and Logistic Regression. It also evaluates
Highest Skill Gap and Popularity as deterministic baselines over the same held-out learners. Baselines
are comparison instruments, not trained models and not product recommendations.

The selected model is Random Forest. On the untouched test group it measures:

| Metric | Value |
| --- | ---: |
| Accuracy | 0.717333 |
| Precision | 0.560195 |
| Recall | 0.788443 |
| F1 | 0.655004 |
| ROC-AUC | 0.801410 |
| Precision@3 | 0.524444 |
| Precision@5 | 0.525333 |
| Recall@5 | 0.434088 |
| NDCG@5 | 0.578463 |

Against the strongest baseline, Highest Skill Gap, the selected model adds 0.070625 ROC-AUC and
0.014667 Precision@5, while held-out NDCG@5 is 0.002766 lower. These mixed results are reported
unchanged: selection occurred on the validation learners, and the held-out test group is not used to
retune the choice. The numbers are computed from the artifact and are not hardcoded into the UI.

The selection is not changed after seeing final test differences because Random Forest won on the
validation group. This is an intentional defense against test-set tuning.

## Artifacts and service

`npm run ml:train:evaluate` writes:

- `services/ml/data/splits/learner-disjoint-split-v1.csv`;
- `services/ml/models/benefit-ranking-v2/model.joblib`; and
- `services/ml/models/benefit-ranking-v2/manifest.json`.

The manifest stores model, dataset, feature, experiment, and split versions; training configuration;
classification and ranking metrics; feature importance; checksums; creation time; validation gates;
and deployment status. `GET /experiments/current/overview` exposes the checked manifest. ML readiness
fails when the experiment artifact is unavailable or invalid.

`/model-evaluation` visualizes these live service values, including split membership, model and
baseline comparison, feature importance, confusion matrix, and the deployment boundary.

## Validation gates

Automated tests verify exact deterministic split counts, no learner overlap, complete learner
coverage, required models and metrics, validation-only selection, model serialization, checksum
integrity, held-out metric recomputation, baseline recomputation, and the absence of `/predict`.

## Deferred by design

The Phase 14 artifact itself remains an immutable `EVALUATED_NOT_DEPLOYED` experiment record. The
separate checksum- and schema-validated runtime serves it locally. Phase 16 consumes its probabilities
for graph-valid course paths; dynamic regeneration remains closed until Phase 18.
