import http from "node:http";
import { createRequestHandler } from "@react-router/node";
import * as build from "./build/server/index.js";

const handler = createRequestHandler(build, process.env.NODE_ENV);

const port = Number(process.env.PORT || 3000);
const host = "0.0.0.0";

http.createServer((req, res) => handler(req, res)).listen(port, host, () => {
  console.log(`Listening on http://${host}:${port}`);
});