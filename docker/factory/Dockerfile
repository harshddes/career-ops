FROM node:20-bookworm-slim

WORKDIR /app

# Root lockfile is not in git. Playwright browsers are not needed to serve :3737.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

COPY package.json ./
COPY WEB-TRACKER/package.json ./WEB-TRACKER/
RUN npm install --omit=dev \
  && cd WEB-TRACKER && npm install --omit=dev

COPY . .

WORKDIR /app/WEB-TRACKER
ENV PORT=3737
ENV HOST=0.0.0.0
EXPOSE 3737

CMD ["node", "run.mjs", "--mode", "manual", "--no-open"]
