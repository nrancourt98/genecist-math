FROM node:lts

WORKDIR /app
COPY package*.json ./
RUN npm ci

COPY . .
ENV BACKEND_PORT=80
EXPOSE 80

CMD [ "node", "src/index.js" ]