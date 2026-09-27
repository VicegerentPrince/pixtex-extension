// esbuild inlines imported PNGs as data URLs (scripts/build.mjs `loader`).
declare module '*.png' {
  const src: string
  export default src
}
