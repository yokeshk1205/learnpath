import { existsSync } from "node:fs";
import { delimiter, resolve } from "node:path";
import { spawn } from "node:child_process";
import { projectRoot } from "../config/environment.mjs";

export function virtualEnvironmentPython(directory = projectRoot, platform = process.platform) {
  return resolve(directory, ".venv", ...(platform === "win32" ? ["Scripts", "python.exe"] : ["bin", "python"]));
}

export function pythonEnvironment(environment = process.env, directory = projectRoot) {
  return { ...environment, PYTHONPATH: [resolve(directory, "services/ml"), environment.PYTHONPATH].filter(Boolean).join(delimiter) };
}

export function runPython(executable, args, options = {}) {
  return new Promise((resolveExit, reject) => {
    const child = spawn(executable, args, { cwd: projectRoot, env: pythonEnvironment(), stdio: "inherit", windowsHide: true, ...options });
    const stop = () => { if (!child.killed) child.kill("SIGTERM"); };
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
    const cleanup = () => { process.off("SIGINT", stop); process.off("SIGTERM", stop); };
    child.once("error", (error) => { cleanup(); reject(error); });
    child.once("exit", (code) => { cleanup(); resolveExit(code ?? 1); });
  });
}

export function requireVirtualEnvironment() {
  const executable = virtualEnvironmentPython();
  if (!existsSync(executable)) throw new Error("Python environment missing. Install Python 3.11 or 3.12 and run npm run setup:python.");
  return executable;
}
