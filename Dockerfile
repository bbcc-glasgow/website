# Toolchain image for collaudo DA/QAA sandboxes (ADR-0011: toolchainDockerfile).
# Playwright base ships Node + Chromium + system deps, which the a11y gate and
# Lighthouse both need; pnpm comes via corepack.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

RUN corepack enable

WORKDIR /work
