// Local preview server for SeastackSchool.
//   node serve.mjs          serves the app from this folder
//   node serve.mjs _site    serves the built site (run `node scripts/build-pages.mjs` first)
// then open http://localhost:3000
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), process.argv[2] || ".");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".xml": "application/xml; charset=utf-8" };
http.createServer((req, res) => {
  // the built pages link to /seastackschool/..., the address they have on the public site
  let name = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "").replace(/^seastackschool\/?/, "");
  if (name === "" || name.endsWith("/")) name += "index.html";
  const file = path.join(root, name);
  if (!file.startsWith(root) || !types[path.extname(file)] || !fs.existsSync(file)) { res.writeHead(404); res.end("Not found"); return; }
  res.writeHead(200, { "content-type": types[path.extname(file)], "cache-control": "no-store" });
  res.end(fs.readFileSync(file));
}).listen(3000, "127.0.0.1", () => console.log("SeastackSchool on http://localhost:3000 serving " + root));
