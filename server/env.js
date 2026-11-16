import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
// Native Node env parsing; inherited process variables take precedence.
for (const name of ['.env.local', '.env']) {
  const file = fileURLToPath(new URL('../' + name, import.meta.url));
  if (fs.existsSync(file)) process.loadEnvFile(file);
}
