FROM pgvector/pgvector:pg16 AS runtime

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 python3-pip curl ca-certificates gnupg \
  && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
  && apt-get update \
  && apt-get install -y --no-install-recommends nodejs \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm ci --omit=dev
COPY dist /app/dist
COPY migrations /migrations
COPY scripts/docker-migrate.sh /docker-migrate.sh
COPY scripts/docker-standalone-entrypoint.sh /docker-standalone-entrypoint.sh
RUN chmod +x /docker-migrate.sh /docker-standalone-entrypoint.sh

WORKDIR /space
COPY requirements.txt /space/requirements.txt
RUN pip3 install --no-cache-dir --break-system-packages -r /space/requirements.txt
COPY app.py /space/app.py
COPY entrypoint.sh /space/entrypoint.sh
COPY README.md /space/README.md
RUN chmod +x /space/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3001
ENV PGDATA=/var/lib/postgresql/data
ENV POSTGRES_USER=aionis
ENV POSTGRES_PASSWORD=aionis
ENV POSTGRES_DB=aionis_memory
ENV GRADIO_SERVER_NAME=0.0.0.0
ENV GRADIO_SERVER_PORT=7860
ENV AIONIS_INTERNAL_BASE_URL=http://127.0.0.1:3001

EXPOSE 7860

ENTRYPOINT ["/space/entrypoint.sh"]
