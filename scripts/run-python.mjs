import { requireVirtualEnvironment, runPython } from "./python-runtime.mjs";

const tasks = {
  serve: ["-m", "uvicorn", "app.main:app", "--reload", "--host", "127.0.0.1", "--port", process.env.ML_PORT ?? "8000"],
  synthetic: ["-m", "app.synthetic.generate", "--curriculum", "services/ml/data/input/curriculum_v1.json", "--output-directory", "services/ml/data/synthetic"],
  features: ["-m", "app.features.generate", "--input", "services/ml/data/synthetic/synthetic-interactions-v2.csv", "--curriculum", "services/ml/data/input/curriculum_v1.json", "--output-directory", "services/ml/data/features"],
  train: ["-m", "app.training.train", "--features", "services/ml/data/features/engineered-features-v2.csv", "--feature-manifest", "services/ml/data/features/manifest.json", "--output-directory", "services/ml/models/benefit-ranking-v2", "--split-directory", "services/ml/data/splits"],
  test: ["-m", "pytest", "services/ml"],
};
try {
  const args = tasks[process.argv[2]];
  if (!args) throw new Error("Choose a Python task: serve, synthetic, features, train, or test.");
  process.exitCode = await runPython(requireVirtualEnvironment(), [...args, ...process.argv.slice(3)]);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
