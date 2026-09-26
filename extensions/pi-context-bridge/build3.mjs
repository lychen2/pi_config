import * as esbuild from "esbuild";
const t0=Date.now();
await esbuild.build({
  entryPoints: ["/tmp/tn2/pkg/pi-maestro-teammate/src/extension/index.ts"],
  bundle: true, format: "esm", platform: "node", target: "node22",
  outfile: "/tmp/tn2/pkg/teammate.full.mjs", logLevel: "error",
  external: ["@earendil-works/pi-coding-agent", "@deepseek-ai/dsh-sdk-protocol", "cpu-features", "ssh2", "*.node"],
});
console.log("esbuild full bundle ms", Date.now()-t0);
