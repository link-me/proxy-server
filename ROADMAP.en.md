# ROADMAP (EN)

Reverse proxy evolution plan:

- Add metrics (Prometheus/OTEL), dashboards and alerts.
- Config file support (yaml/json) with hot reload.
- Host/path allow/deny lists and ACLs.
- Timeouts, retries and circuit breaker.
- TLS termination and HTTP→HTTPS redirect at ingress.
- Extensible cache (LRU, external stores: Redis/Memcached).
- Distributed rate limiting (Redis), client identification.
- Load balancing to backend pool (round‑robin, least connections).
- Handling large request bodies (streaming, limits, uploads).
- Testing (unit/integration), load tests and benchmarks.
- Structured logging (JSON) and rotation.
- Cluster mode and graceful shutdown.