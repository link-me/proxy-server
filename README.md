# Proxy Server

Стек: Node.js + Docker

Минимальный, но полезный reverse proxy (обратный прокси) на Node.js без внешних зависимостей. Умеет: проксирование на целевой бэкенд, переписывание пути `/api/* → /*`, CORS, rate limit, простой кэш для GET, gzip‑сжатие, health‑check и логирование.

**Возможности**
- Reverse proxy на `TARGET_URL` (по умолчанию `https://httpbin.org`).
- Переписывание пути: `/api/foo` → `/foo`.
- Кэш GET‑ответов в памяти с TTL.
- Rate limit по IP: окно и порог настраиваются.
- CORS заголовки и обработка preflight (OPTIONS).
- Gzip‑сжатие ответов при поддержке клиентом.
- Endpoint `/health`.

**Быстрый старт (локально)**
- Перейти в каталог проекта: `projects/proxy-server`
- Запустить: `node src/main.js` (или `./bin/node.exe src/main.js`, если нет Node.js в системе)
- Примеры запросов:
  - `http://localhost:8080/health` → `{"status":"ok"}`
  - `http://localhost:8080/api/get?x=1` → проксируется на целевой `GET /get?x=1`

**Настройки окружения**
- `PORT` — порт (по умолчанию `8080`)
- `TARGET_URL` — базовый адрес бэкенда (по умолчанию `https://httpbin.org`)
- `CACHE_TTL_MS` — TTL кэша GET (по умолчанию `5000`)
- `RATE_LIMIT_WINDOW_MS` — окно rate limit (по умолчанию `60000`)
- `RATE_LIMIT_MAX` — максимум запросов за окно (по умолчанию `60`)
- `CORS_ORIGIN` — `Access-Control-Allow-Origin` (по умолчанию `*`)
- `ENABLE_GZIP` — включить gzip (`true/false`, по умолчанию `true`)

Запуск с переменными окружения (пример Windows PowerShell):
```
$env:PORT=8080; $env:TARGET_URL="https://httpbin.org"; node src/main.js
```

**Docker**
- Сборка: `docker build -t proxy-server .`
- Запуск: `docker run --rm -p 8080:8080 -e TARGET_URL=https://httpbin.org proxy-server`
- Compose: `docker compose up --build`

**Команды**
- `node src/main.js` — запуск сервера
- `docker build -t proxy-server .` — образ
- `docker compose up --build` — запуск через compose

**Ограничения**
- Кэш — в памяти (подходит для демо; для прод нужен внешний стор).
- Rate limit — простой по IP; для прод лучше стораге/кластер.
- Без HTTPS‑терминации на входе (ожидается на уровне ingress/балансера).

**Архитектура**
- `src/main.js` — сервер и логика прокси/кэша/лимита/CORS/gzip/health.
- `Dockerfile`, `docker-compose.yml` — контейнеризация.

Готов к расширению: метрики, конфиг из файла, списки разрешённых/запрещённых хостов, ретраи, таймауты и др.
