import * as esbuild from "esbuild";
const t0=Date.now();
await esbuild.build({
  entryPoints: ["/tmp/tn2/pkg/pi-maestro-teammate/src/extension/index.ts"],
  bundle: true, format: "esm", platform: "node", target: "node22",
  outfile: "/tmp/tn2/pkg/teammate.ts.mjs", logLevel: "error",
  plugins: [{
    name: "bundle-ts-only",
    setup(b) {
      b.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === "entry-point") return;
        if (/\.(ts|tsx|mts|cts)$/.test(args.path)) return; // bundle TS
        return { path: args.path, external: true };       // keep JS external
      });
    },
  }],
});
console.log("esbuild ts-only bundle ms", Date.now()-t0);
