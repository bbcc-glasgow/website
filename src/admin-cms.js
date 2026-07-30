// Decap CMS manual initialisation — flag must be set before the import chain
// evaluates, so this file is bundler-processed (esbuild) into a single IIFE
// with in-order execution: flag set, then init().
window.CMS_MANUAL_INIT = true;

import CMS from "decap-cms-app";

CMS.init();
