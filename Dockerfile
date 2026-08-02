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

# The playwright base image ships Node 22.12.0 whose bundled corepack (0.29.4)
# cannot verify the npm registry's rotated signing key, so pnpm invocations at
# runtime throw 'Cannot find matching keyid' (corepack fetches the pnpm
# 'latest' dist-tag to build a fallback locator before reading package.json).
# Upgrade corepack to a version that knows the current key, then enable and
# pre-cache pnpm@9.15.0 as before.
RUN npm install -g corepack@0.35.0 \
 && corepack enable \
 && corepack prepare pnpm@9.15.0 --activate

WORKDIR /work
