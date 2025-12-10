#!/usr/bin/env node

/**
 * Custom server script pentru Fly.io
 * Forțează serverul să asculte pe 0.0.0.0 în loc de 127.0.0.1
 */

import { createServer } from "node:http";
import { createRequestHandler } from "react-router";;
import { installGlobals } from "react-router";

// Instalează globals pentru Node.js
installGlobals();

// Importă server-ul React Router
const build = await import("./build/server/index.js");

// Creează request handler
const requestHandler = createRequestHandler({
  build,
  mode: process.env.NODE_ENV || "production",
});

// Obține port și host din environment
// IMPORTANT: Pentru Fly.io, trebuie să ascultăm pe 0.0.0.0, nu pe 127.0.0.1
const port = process.env.PORT || 8080;
const host = "0.0.0.0"; // Forțează 0.0.0.0 pentru Fly.io

// Creează server HTTP
const server = createServer((req, res) => {
  return requestHandler(req, res);
});

// Pornește serverul pe 0.0.0.0:port
server.listen(port, host, () => {
  console.log(`🚀 Server listening on ${host}:${port}`);
  console.log(`📡 Environment: ${process.env.NODE_ENV || "production"}`);
});

// Gestionare erori
server.on("error", (error) => {
  console.error("❌ Server error:", error);
  process.exit(1);
});

