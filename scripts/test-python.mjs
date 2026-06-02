import { spawnSync } from "node:child_process";

const python = process.env.PYTHON || "python";
const result = spawnSync(
  python,
  ["-m", "unittest", "discover", "-s", "packages/sdk-python/tests"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      PYTHONPATH: ["packages/sdk-python", process.env.PYTHONPATH].filter(Boolean).join(process.platform === "win32" ? ";" : ":")
    }
  }
);

process.exit(result.status ?? 1);

