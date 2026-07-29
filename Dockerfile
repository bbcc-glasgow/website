# Toolchain image for collaudo DA/QAA sandboxes (ADR-0011: toolchainDockerfile).
# Playwright base ships Node + Chromium + system deps, which the a11y gate and
# Lighthouse both need; pnpm comes via corepack.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

ENV CHROME_PATH=/ms-playwright/chromium-1148/chrome-linux/chrome

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /work
