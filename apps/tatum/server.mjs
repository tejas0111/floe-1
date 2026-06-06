import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createReadStream } from "node:fs";
import { promises as fs } from "node:fs";
import { Readable } from "node:stream";

const port = Number(process.env.PORT ?? 3002);
const coreApiBaseUrl = (process.env.FLOE_API_BASE_URL ?? "http://localhost:3001").replace(/\/+$/, "");
const cookieName = "floe_wallet";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "dist");

function parseCookies(cookieHeader = "") {
  const cookies = {};
  for (const pair of cookieHeader.split(";")) {
    const index = pair.indexOf("=");
    if (index === -1) continue;
    const key = pair.slice(0, index).trim();
    const value = pair.slice(index + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

function contentTypeFor(filePath) {
  switch (path.extname(filePath).toLowerCase()) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
      return "text/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".gif":
      return "image/gif";
    case ".webp":
      return "image/webp";
    case ".map":
      return "application/json; charset=utf-8";
    case ".woff2":
      return "font/woff2";
    default:
      return "application/octet-stream";
  }
}

function forwardHeaders(req, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  const owner = typeof req.headers["x-owner-address"] === "string" ? req.headers["x-owner-address"].trim() : "";
  const wallet = typeof req.headers["x-wallet-address"] === "string" ? req.headers["x-wallet-address"].trim() : "";
  const apiKey = typeof req.headers["x-api-key"] === "string" ? req.headers["x-api-key"].trim() : "";
  const authorization = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";

  if (owner) headers["x-owner-address"] = owner;
  if (wallet) headers["x-wallet-address"] = wallet;
  if (apiKey) headers["x-api-key"] = apiKey;
  if (authorization) headers.authorization = authorization;

  if (req.headers.accept) headers.accept = req.headers.accept;
  if (req.headers["content-type"]) headers["content-type"] = req.headers["content-type"];
  if (req.headers["x-chunk-sha256"]) headers["x-chunk-sha256"] = req.headers["x-chunk-sha256"];

  return headers;
}

async function sendCoreResponse(res, response) {
  const headers = {};
  for (const [key, value] of response.headers.entries()) {
    if (key === "transfer-encoding" || key === "content-length") continue;
    headers[key] = value;
  }
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  Readable.fromWeb(response.body).pipe(res);
}

async function proxyRequest(req, res, targetPath) {
  const response = await fetch(`${coreApiBaseUrl}${targetPath}`, {
    method: req.method,
    headers: forwardHeaders(req, { accept: req.headers.accept || "application/json" }),
    body: req.method === "GET" || req.method === "HEAD" ? undefined : req,
    duplex: req.method === "GET" || req.method === "HEAD" ? undefined : "half",
  });
  await sendCoreResponse(res, response);
}

async function serveStaticAsset(req, res, pathname) {
  if (!pathname || pathname === "/") {
    pathname = "/index.html";
  }

  const resolved = path.resolve(distDir, `.${pathname}`);
  if (!resolved.startsWith(distDir)) {
    res.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
    res.end("Forbidden");
    return;
  }

  try {
    const stat = await fs.stat(resolved);
    if (stat.isDirectory()) {
      return serveStaticAsset(req, res, `${pathname.replace(/\/$/, "")}/index.html`);
    }

    res.writeHead(200, {
      "content-type": contentTypeFor(resolved),
      "cache-control": pathname === "/index.html" ? "no-cache" : "public, max-age=31536000, immutable",
    });
    createReadStream(resolved).pipe(res);
    return;
  } catch {
    const fallback = path.join(distDir, "index.html");
    try {
      const html = await fs.readFile(fallback, "utf8");
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-cache" });
      res.end(html);
    } catch {
      res.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
      res.end("Tatum build not found. Run `npm run build --workspace=apps/tatum` first.");
    }
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const cookies = parseCookies(req.headers.cookie || "");
    const ownerFromCookie = cookies[cookieName] || null;

    if (url.pathname === "/healthz") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, coreApiBaseUrl, port }));
      return;
    }

    if (url.pathname === "/api/auth/session" && req.method === "GET") {
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ owner: ownerFromCookie }));
      return;
    }

    if (url.pathname === "/api/auth/session" && req.method === "POST") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const raw = Buffer.concat(chunks).toString("utf8");
      const body = raw ? JSON.parse(raw) : {};
      const owner = typeof body.owner === "string" ? body.owner.trim() : "";
      const cookie = owner
        ? `${cookieName}=${encodeURIComponent(owner)}; Path=/; SameSite=Lax; Max-Age=2592000`
        : `${cookieName}=; Path=/; SameSite=Lax; Max-Age=0`;
      res.writeHead(200, {
        "content-type": "application/json; charset=utf-8",
        "set-cookie": cookie,
      });
      res.end(JSON.stringify({ owner }));
      return;
    }

    if (url.pathname.startsWith("/api/")) {
      await proxyRequest(req, res, url.pathname.replace(/^\/api/, "/v1") + url.search);
      return;
    }

    if (url.pathname.startsWith("/v1/")) {
      await proxyRequest(req, res, url.pathname + url.search);
      return;
    }

    await serveStaticAsset(req, res, url.pathname);
  } catch (error) {
    if (res.headersSent) {
      res.end();
      return;
    }
    res.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: String(error?.message ?? error) }));
  }
});

server.listen(port, () => {
  console.log(`Tatum service listening on http://localhost:${port}`);
});
