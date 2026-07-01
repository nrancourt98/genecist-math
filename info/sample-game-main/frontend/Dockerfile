FROM node:lts as builder

WORKDIR /app
COPY . /app
RUN npm ci && npm run build

FROM nginx:stable

COPY --from=builder /app/dist/ /usr/share/nginx/html/
