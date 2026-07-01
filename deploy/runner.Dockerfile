# Wraps BGaming's runner_cli binary (vendored at docs/runner_cli-x86_64-unknown-linux-gnu)
# in its own image, purely for our self-hosted dev/staging deployment - this image is
# never seen or run by BGaming; their platform runs its own copy of the real runner once
# the game is actually submitted. See deploy/README.md.
#
# Build context MUST be the repo root, same reason as project/backend/Dockerfile:
#   docker build -f deploy/runner.Dockerfile -t wildly-monsters-runner .

FROM debian:bookworm-slim

# ASSUMPTION, unverified: a stripped "*-unknown-linux-gnu" binary like this typically
# needs only glibc (already in the base image) plus ca-certificates if it makes outbound
# HTTPS calls - neither Docker nor WSL was available on the machine this was drafted on,
# so runner_cli has not actually been executed yet anywhere. If the container exits
# immediately or logs a missing-library error, that's the first thing to check
# (`docker compose logs runner`) - install whatever's missing here and rebuild.
ENV LANG=C.UTF-8

RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates \
    && rm -rf /var/lib/apt/lists/* \
    && mkdir -p /root/.cache/bakeware

COPY docs/runner_cli-x86_64-unknown-linux-gnu /usr/local/bin/runner_cli
RUN chmod +x /usr/local/bin/runner_cli

WORKDIR /runner
COPY deploy/runner-config.yml ./config.yml

EXPOSE 4000

ENTRYPOINT ["runner_cli"]
# -p/-c/-b flags per the BGaming Technical Documentation PDF's "Local runner" example
# (`runner -p 4000 -c ./myGame/config.yml -b http://localhost:3050/myGame/backend`) -
# "backend" below is this compose network's service name for project/backend's container,
# reachable on port 80 per that Dockerfile's BACKEND_PORT=80. Flag names/defaults are
# unverified against this specific binary - run `runner_cli --help` on the server if this
# doesn't start cleanly.
CMD ["-p", "4000", "-c", "/runner/config.yml"]
