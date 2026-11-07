FROM node:24.21.0-bookworm-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends curl ca-certificates build-essential python3 git \
 && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --profile minimal --default-toolchain stable
RUN curl -LsSf https://astral.sh/uv/install.sh | sh
ENV PATH=/root/.cargo/bin:/root/.local/bin:$PATH
RUN git config --global --add safe.directory '*'
