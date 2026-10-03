// Local preview server for SeastackSchool: node serve.mjs, then open http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.dirname(fileURLToPath(import.meta.url));
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8" };
http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const file = path.join(root, name);
  if (!file.startsWith(root) || !types[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)], "cache-control": "no-store" });
  res.end(fs.readFileSync(file));
}).listen(3000, "127.0.0.1", () => console.log("SeastackSchool on http://localhost:3000"));
