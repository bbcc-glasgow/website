# Toolchain image for collaudo DA/QAA sandboxes (ADR-0011: toolchainDockerfile).
# Playwright base ships Node + Chromium + system deps, which the a11y gate and
# Lighthouse both need; pnpm comes via corepack.
FROM mcr.microsoft.com/playwright:v1.49.1-noble

ENV CHROME_PATH=/ms-playwright/chromium-1148/chrome-linux/chrome

# Symlink so chrome-launcher (used by LHCI healthcheck) discovers Chrome
# via `which google-chrome` even when ENV CHROME_PATH is stripped by the
# sandbox runtime. The path is tied to Playwright v1.49.1's bundled
# Chromium revision 1148; update both when the base image tag changes.
RUN ln -s /ms-playwright/chromium-1148/chrome-linux/chrome /usr/bin/google-chrome

RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

WORKDIR /work
