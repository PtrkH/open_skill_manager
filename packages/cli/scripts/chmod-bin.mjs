import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const bin = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../dist/index.js");
if (fs.existsSync(bin)) {
  const content = fs.readFileSync(bin, "utf8");
  if (!content.startsWith("#!")) {
    fs.writeFileSync(bin, `#!/usr/bin/env node\n${content}`);
  }
  fs.chmodSync(bin, 0o755);
}
