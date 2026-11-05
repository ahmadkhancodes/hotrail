#!/usr/bin/env node
import { main } from "./cli";

main(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  out: (s) => console.log(s),
  err: (s) => console.error(s),
}).then((code) => process.exit(code));
