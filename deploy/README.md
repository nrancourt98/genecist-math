# Self-hosted dev/staging deployment

Gives a frontend developer a publicly-reachable API to build against, hosted on your own
server behind your existing nginx + domain. **Not** BGaming's actual submission pipeline -
that's a separate, much simpler step (`docker build` + `docker image push` straight from
`project/backend/Dockerfile`, once you have hyper-hive registry access). Nothing in this
`deploy/` directory is ever seen or run by BGaming; it's purely our own infrastructure.

## The architecture (important - the frontend does NOT call our backend directly)

```
Frontend  <-->  runner_cli (BGaming's "Runner")  <-->  our backend (project/backend)
```

`runner_cli` is BGaming's local/self-hosted implementation of their Runner service. It is
the thing with a public API (`init`/`info`/`play`/`replay`, token/session-based) - a
frontend talks to *it*, never to our backend. It also bundles two things our backend
depends on:

- **The RNG microservice** our backend calls for every real (non-godmode) random draw.
  This is why `RNG_URL`'s default in `project/backend/src/rng/rngClient.js` already points
  at `http://localhost:4002/api` - that's runner_cli's own documented local default, not a
  coincidence.
- **A session/God-mode admin web UI**, on the same host:port as its main API - lets you
  force RNG outcomes and issue freebets per session. Since this deployment is fully public
  (your choice), that admin surface is reachable by anyone with the URL too. Fine for a
  pre-release, no-real-money dev environment; revisit if that ever changes.

Our backend's `/api` route is purely an internal contract between runner_cli and our Node
service - `runner_cli`'s `config.yml` (`backend.url`) is what wires them together, and the
compose network's internal DNS (`http://backend:80/api`) keeps that connection off the
public internet entirely - only `runner_cli`'s port is ever exposed.

## What's unverified

Neither Docker nor WSL is available on the machine this was drafted on, so **none of this
has actually been run yet** - everything below is built directly from BGaming's Technical
Documentation PDF and the sample game's `config.yml`/README, not from observed behavior.
Specifically unverified, in rough order of "most likely to need a tweak":

1. **`runner_cli`'s exact CLI flags** (`-p`/`-c`/`-b` in `deploy/runner.Dockerfile`'s
   `CMD`) - taken from the PDF's one documented example. Run `docker compose run --rm
   runner runner_cli --help` (override the entrypoint's default args) on your server to
   confirm the real flag names before trusting this blindly.
2. **The RNG service's port** (`4002`, used in `docker-compose.yml`'s `RNG_URL`) - only
   confirmed as the documented *localhost* default, not confirmed reachable via the
   compose service name in a multi-container setup. Check `docker compose logs runner` for
   what it actually binds.
3. **`runner.Dockerfile`'s base image** (`debian:bookworm-slim` + `ca-certificates`) - a
   reasonable guess for a stripped Rust-style Linux binary, not confirmed against this
   specific file. If the container exits immediately, `docker compose logs runner` should
   point at a missing shared library.

None of these are exotic risks - just genuinely unverifiable without a machine that can
run Linux binaries, which this one can't. Budget some iteration time on the server.

## Setup steps (on your server, with Docker already installed)

1. `git pull` (or however you get this repo onto the server).
2. Pick a real session token: edit `deploy/runner-config.yml`, rename the placeholder
   `dev0000000000000000000000000001` session key to your own random hex string, and adjust
   `bet_limits`/`default_bet`/`currency` if the placeholders don't suit you.
3. Build and start:
   ```sh
   docker compose -f deploy/docker-compose.yml up -d --build
   ```
4. Check both containers came up clean:
   ```sh
   docker compose -f deploy/docker-compose.yml logs -f
   ```
5. Smoke-test locally on the server before wiring up nginx:
   ```sh
   curl -X POST http://127.0.0.1:4001/api -H 'content-type: application/json' \
     -d '{"jsonrpc":"2.0","id":1,"method":"init","params":{"token":"<your token from step 2>"}}'
   ```
   Expect a JSON result with `balance`/`config`/etc. - not a connection error.

   Confirmed port map (discovered by running the binary - two separate ports, not one):
   - **4001** — game-facing JSON-RPC API (`init`/`info`/`play`/`replay`) — proxied by nginx
   - **4000** — runner admin UI (sessions, god mode, freebets) — keep internal/SSH-tunnel
   - **4002** — RNG microservice (internal only, called by the backend container)
6. Copy `deploy/nginx-runner.conf.example` into your nginx sites, replace
   `api-dev.your-domain.example` and the `ssl_certificate` paths with your real values,
   enable the site, `nginx -t && systemctl reload nginx`.
7. Give your frontend dev: the public URL (e.g. `https://api-dev.your-domain.example`) and
   the session token from step 2. They call `init`/`play` against it per BGaming's Runner
   API (Technical Documentation PDF, "API Description" section) - same contract a real
   BGaming-hosted frontend would use.

## Updating after an engine/backend change

```sh
git pull
docker compose -f deploy/docker-compose.yml up -d --build backend
```

Only `backend` needs rebuilding for engine/backend code changes - `runner` only needs a
rebuild if `deploy/runner-config.yml` changes (new session, different bet limits, etc.) or
the vendored `runner_cli` binary itself is replaced with a newer build.
