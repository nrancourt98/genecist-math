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

EXPOSE 4000 4001

ENTRYPOINT ["runner_cli"]
# Only -c is passed; -p and -b are NOT valid flags for this binary (confirmed by running
# it - "-b : Unknown option", and passing -p alongside config.yml caused a double-bind on
# port 4000 since the config already sets the port internally). The runner defaults to
# port 4000, which Docker's compose port mapping ("4000:4000") forwards independently.
CMD ["-c", "/runner/config.yml"]
