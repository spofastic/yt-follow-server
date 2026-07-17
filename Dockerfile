FROM node:20-alpine
WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY . .

ENV PORT=8080
ENV DATA_DIR=/app/data
EXPOSE 8080
VOLUME ["/app/data"]

CMD ["node", "server.js"]
