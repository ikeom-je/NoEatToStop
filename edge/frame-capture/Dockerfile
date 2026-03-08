FROM node:20-alpine

RUN apk add --no-cache ffmpeg

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production

COPY capture.js ./

CMD ["node", "capture.js"]
