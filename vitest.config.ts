import { defineConfig } from 'vitest/config'

export default defineConfig({
  // The same constants the store build injects (scripts/build.mjs).
  define: {
    __PIXTEX_API__: JSON.stringify('https://api.pixtex.dev'),
    __PIXTEX_WEB__: JSON.stringify('https://pixtex.dev'),
    __FLAVOUR__: JSON.stringify('store'),
  },
  test: {
    include: ['test/unit/**/*.test.ts'],
    environment: 'node',
    // Fixture pages are parsed, never run: without this happy-dom tries to
    // fetch every <script src> and stylesheet in a saved n8n editor page.
    environmentOptions: {
      happyDOM: {
        settings: {
          disableJavaScriptFileLoading: true,
          disableJavaScriptEvaluation: true,
          disableCSSFileLoading: true,
          handleDisabledFileLoadingAsSuccess: true,
        },
      },
    },
  },
})
