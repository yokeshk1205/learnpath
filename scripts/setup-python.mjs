import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { projectRoot } from "../config/environment.mjs";
import { runPython, virtualEnvironmentPython } from "./python-runtime.mjs";

try {
  const executable = virtualEnvironmentPython();
  if (!existsSync(executable)) {
    const candidates = process.env.PYTHON ? [[process.env.PYTHON, []]]
      : process.platform === "win32" ? [["py", ["-3.12"]], ["py", ["-3.11"]], ["python", []]]
        : [["python3.12", []], ["python3.11", []], ["python3", []], ["python", []]];
    const installed = candidates.find(([command, args]) => spawnSync(command,
      [...args, "-c", "import sys; sys.exit(0 if sys.version_info >= (3,11) else 1)"],
      { stdio: "ignore", windowsHide: true }).status === 0);
    if (!installed) throw new Error("Install Python 3.11 or 3.12 (with venv/pip), then retry. PYTHON may specify a Python executable path.");
    const status = await runPython(installed[0], [...installed[1], "-m", "venv", resolve(projectRoot, ".venv")]);
    if (status !== 0) throw new Error("Could not create .venv. On Linux, check that python3-venv is installed.");
  }
  const status = await runPython(executable, ["-m", "pip", "install", "-r", "services/ml/requirements-dev.txt"]);
  if (status !== 0) throw new Error("Python dependency installation failed. Check the preceding pip output and your network connection.");
  console.log("Python environment ready. No activation is needed for npm run dev:ml.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
