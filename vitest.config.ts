import { defineConfig } from "vitest/config";

// The LibreOffice tests share one soffice profile and cannot run in parallel.
export default defineConfig({ test: { fileParallelism: false } });
