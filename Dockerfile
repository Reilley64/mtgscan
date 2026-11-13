FROM debian:bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl build-essential pkg-config && rm -rf /var/lib/apt/lists/*
RUN curl --proto '=https' --tlsv1.2 -fsSL https://mise.run | sh
ENV PATH="/root/.local/bin:/root/.cargo/bin:${PATH}"
WORKDIR /build
COPY mise.toml Cargo.toml Cargo.lock ./
COPY crates ./crates
RUN mise trust /build/mise.toml && mise install rust && mise exec rust -- cargo build --release --locked -p mtgscan-server

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
COPY --from=build /build/target/release/mtgscan-server /usr/local/bin/mtgscan-server
USER 65532:65532
ENV LISTEN_ADDRESS=0.0.0.0:8080
EXPOSE 8080
STOPSIGNAL SIGTERM
ENTRYPOINT ["/usr/local/bin/mtgscan-server"]
