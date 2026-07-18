// Static server for build/web on :8081 + same-origin proxy to the Googer backend,
// so the Flutter web app can call /api without CORS issues.
const http = require("http");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "build", "web");
const PORT = 8081;
const BACKEND = { host: "127.0.0.1", port: 5000 }; // Express API
const FRONTEND = { host: "127.0.0.1", port: 3000 }; // Next (serves /uploads, /assets)

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".ttf": "font/ttf",
  ".otf": "font/otf",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
  ".frag": "text/plain",
  ".bin": "application/octet-stream",
};

function proxy(req, res, target) {
  const opts = {
    host: target.host,
    port: target.port,
    path: req.url,
    method: req.method,
    headers: { ...req.headers, host: `${target.host}:${target.port}` },
  };
  const up = http.request(opts, (upRes) => {
    res.writeHead(upRes.statusCode || 502, upRes.headers);
    upRes.pipe(res);
  });
  up.on("error", () => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "backend unavailable" }));
  });
  req.pipe(up);
}

http
  .createServer((req, res) => {
    const urlPath = decodeURIComponent(new URL(req.url, "http://x").pathname);
    if (urlPath.startsWith("/api/") || urlPath.startsWith("/socket.io/")) return proxy(req, res, BACKEND);
    if (urlPath.startsWith("/uploads/")) return proxy(req, res, FRONTEND);

    let filePath = path.normalize(path.join(ROOT, urlPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end();
      return;
    }
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      filePath = path.join(ROOT, "index.html"); // SPA fallback
    }
    const ext = path.extname(filePath).toLowerCase();
    // JS/HTML/JSON always fresh (Flutter web bundles are not content-hashed); only media cached.
    // no-store + CDN-Cache-Control so Cloudflare's edge/browser TTL overrides don't pin old builds.
    const fresh = [".html", ".js", ".mjs", ".json", ".wasm"].includes(ext);
    res.writeHead(200, {
      "Content-Type": TYPES[ext] || "application/octet-stream",
      "Cache-Control": fresh ? "no-store, must-revalidate" : "public, max-age=3600",
      ...(fresh ? { "CDN-Cache-Control": "no-store" } : {}),
    });
    fs.createReadStream(filePath).pipe(res);
  })
  .listen(PORT, () => console.log(`googer-flutter web + api proxy on :${PORT}`));
