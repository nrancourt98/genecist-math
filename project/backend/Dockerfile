# Build context MUST be the repo root (not project/backend/), e.g.:
#   docker build -f project/backend/Dockerfile -t wildly-monsters-backend .
# This is required because the backend requires the sibling ../../engine package,
# which must be copied into the image alongside the backend itself.

FROM node:lts

WORKDIR /app

COPY project/backend/package*.json ./backend/
RUN npm ci --prefix ./backend

COPY project/engine/ ./engine/
COPY project/backend/ ./backend/

ENV BACKEND_PORT=80
EXPOSE 80

CMD [ "node", "backend/src/index.js" ]
