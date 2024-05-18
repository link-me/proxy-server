const http = require('http');
const https = require('https');
const { URL } = require('url');
const zlib = require('zlib');

const PORT = parseInt(process.env.PORT || '8080', 10);
const TARGET_URL = process.env.TARGET_URL || 'https://httpbin.org';
const CACHE_TTL_MS = parseInt(process.env.CACHE_TTL_MS || '5000', 10);
const RATE_LIMIT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10);
const RATE_LIMIT_MAX = parseInt(process.env.RATE_LIMIT_MAX || '60', 10);
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ENABLE_GZIP = (process.env.ENABLE_GZIP || 'true').toLowerCase() === 'true';

const targetBase = new URL(TARGET_URL);

const cache = new Map(); // key -> { body, headers, statusCode, expiresAt }
const rateLimit = new Map(); // ip -> { count, windowStart }

function now() { return Date.now(); }

function log(msg) { console.log(`[${new Date().toISOString()}] ${msg}`); }

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', CORS_ORIGIN);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function handlePreflight(req, res) {
  setCors(res);
  res.statusCode = 204;
  res.end();
}

function checkRateLimit(ip) {
  const t = now();
  const rec = rateLimit.get(ip) || { count: 0, windowStart: t };
  if (t - rec.windowStart >= RATE_LIMIT_WINDOW_MS) {
    rec.count = 0;
    rec.windowStart = t;
  }
  rec.count += 1;
  rateLimit.set(ip, rec);
  return rec.count <= RATE_LIMIT_MAX;
}

function cacheKey(reqUrl) {
  return `GET:${reqUrl}`;
}

function getFromCache(key) {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < now()) {
    cache.delete(key);
    return null;
  }
  return entry;
}

function putToCache(key, value) {
  value.expiresAt = now() + CACHE_TTL_MS;
  cache.set(key, value);
}

function rewritePath(path) {
  if (path.startsWith('/api/')) return path.replace(/^\/api\//, '/');
  return path;
}

function forward(req, res) {
  const start = now();
  const ip = req.socket?.remoteAddress || 'unknown';

  if (!checkRateLimit(ip)) {
    setCors(res);
    res.statusCode = 429;
    res.setHeader('Retry-After', Math.ceil(RATE_LIMIT_WINDOW_MS / 1000));
    res.end(JSON.stringify({ error: 'rate_limit_exceeded' }));
    log(`429 ${req.method} ${req.url} ip=${ip}`);
    return;
  }

  if (req.method === 'OPTIONS') return handlePreflight(req, res);

  if (req.url === '/health') {
    setCors(res);
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ status: 'ok' }));
    return;
  }

  const rewrittenPath = rewritePath(req.url || '/');
  const targetUrl = new URL(rewrittenPath, TARGET_URL);

  const client = targetUrl.protocol === 'https:' ? https : http;
  const headers = { ...req.headers, host: targetBase.host };
  headers['x-forwarded-host'] = req.headers.host || '';
  headers['x-forwarded-proto'] = 'http';
  headers['x-forwarded-for'] = ip;

  setCors(res);

  // GET caching (buffer response)
  if (req.method === 'GET') {
    const key = cacheKey(targetUrl.toString());
    const cached = getFromCache(key);
    if (cached) {
      res.statusCode = cached.statusCode;
      for (const [h, v] of Object.entries(cached.headers)) res.setHeader(h, v);
      res.end(cached.body);
      log(`CACHE HIT 200 GET ${req.url} -> ${targetUrl} (${now() - start}ms)`);
      return;
    }
  }

  const options = {
    protocol: targetUrl.protocol,
    hostname: targetUrl.hostname,
    port: targetUrl.port || (targetUrl.protocol === 'https:' ? 443 : 80),
    method: req.method,
    path: targetUrl.pathname + targetUrl.search,
    headers,
  };

  const proxyReq = client.request(options, (proxyRes) => {
    let chunks = [];
    let size = 0;
    const isGet = req.method === 'GET';
    const acceptGzip = ENABLE_GZIP && String(req.headers['accept-encoding'] || '').includes('gzip');

    const passthrough = () => {
      res.statusCode = proxyRes.statusCode || 500;
      for (const [h, v] of Object.entries(proxyRes.headers)) res.setHeader(h, v);
      proxyRes.pipe(res);
    };

    if (!isGet) {
      // For non-GET, just stream through
      passthrough();
      proxyRes.on('end', () => {
        log(`${res.statusCode} ${req.method} ${req.url} -> ${targetUrl} (${now() - start}ms)`);
      });
      return;
    }

    proxyRes.on('data', (chunk) => {
      chunks.push(chunk);
      size += chunk.length;
      // avoid over-large cache entries (~1MB)
      if (size > 1_000_000) {
        // too large -> pass through and do not cache
        chunks = null;
      }
    });

    proxyRes.on('end', () => {
      res.statusCode = proxyRes.statusCode || 500;
      let body = Buffer.concat(chunks || []);
      const headersToSend = { ...proxyRes.headers };

      if (acceptGzip) {
        body = zlib.gzipSync(body);
        headersToSend['content-encoding'] = 'gzip';
        // adjust length header
        headersToSend['content-length'] = Buffer.byteLength(body);
      }

      for (const [h, v] of Object.entries(headersToSend)) res.setHeader(h, v);
      res.end(body);

      const ms = now() - start;
      log(`${res.statusCode} GET ${req.url} -> ${targetUrl} (${ms}ms)`);

      // cache only successful small responses
      if (chunks && res.statusCode === 200) {
        const key = cacheKey(targetUrl.toString());
        putToCache(key, {
          body,
          headers: headersToSend,
          statusCode: res.statusCode,
        });
      }
    });
  });

  proxyReq.on('error', (err) => {
    res.statusCode = 502;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'bad_gateway', details: err.message }));
    log(`502 ${req.method} ${req.url} -> ${targetUrl} error=${err.message}`);
  });

  // pipe request body to target
  req.pipe(proxyReq);
}

const server = http.createServer(forward);
server.listen(PORT, () => {
  log(`Proxy server listening on http://localhost:${PORT} -> ${TARGET_URL}`);
});
