import { spawn } from "node:child_process";

const port = process.env.PORT || "3000";
const host = "0.0.0.0";

const child = spawn(
  process.platform === "win32" ? "npx.cmd" : "npx",
  ["react-router-serve", "./build/server/index.js", "--host", host, "--port", port],
  { stdio: "inherit", env: process.env }
);

child.on("exit", (code) => process.exit(code ?? 0));
