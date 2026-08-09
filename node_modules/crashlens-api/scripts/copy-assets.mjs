import { mkdir, copyFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const source = resolve(__dirname, "../src/lib/schema.sql");
const destination = resolve(__dirname, "../dist/lib/schema.sql");

await mkdir(dirname(destination), { recursive: true });
await copyFile(source, destination);

console.log("Copied schema.sql -> dist/lib/schema.sql");
