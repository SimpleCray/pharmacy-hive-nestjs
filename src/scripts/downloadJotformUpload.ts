/**
 * Manual check: download a Jotform upload URL using JOTFORM_API_KEY from .env.
 *
 * Usage:
 *   npx tsx ./src/scripts/downloadJotformUpload.ts
 * Then paste the Jotform upload file URL when prompted.
 *
 * Optional: JOTFORM_FILE_OUT — output path (relative to cwd or absolute). Default: ./downloads/<filename from URL>.
 */
import dotenv from 'dotenv';
import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { createInterface } from 'readline/promises';

dotenv.config();

import { fetchJotformUploadFileBuffer } from '../common/utils/jotformFileDownload';

function printUsage(): void {
  console.error(`ℹ️ Usage: npx tsx ./src/scripts/downloadJotformUpload.ts
Then enter the Jotform upload file URL at the prompt.

Environment:
  JOTFORM_API_KEY   (required)
  JOTFORM_FILE_OUT  (optional output path)`);
}

async function promptFileUrl(): Promise<string | null> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const line = (await rl.question('📝 Jotform file URL: ')).trim();
    if (!line) {
      console.error('❌ No URL entered.');
      return null;
    }
    if (!URL.canParse(line)) {
      console.error('❌ Invalid file URL:', line);
      return null;
    }
    return line;
  } finally {
    rl.close();
  }
}

function resolveOutputPath(fileUrl: string): string {
  const override = process.env.JOTFORM_FILE_OUT;
  if (override) {
    return path.isAbsolute(override) ? override : path.join(process.cwd(), override);
  }

  let filename = 'jotform-download';
  try {
    const base = path.basename(new URL(fileUrl).pathname);
    if (base && base !== '/') {
      filename = decodeURIComponent(base);
    }
  } catch {
    // keep default filename
  }

  return path.join(process.cwd(), 'downloads', filename);
}

async function main(): Promise<void> {
  const arg = process.argv[2]?.trim();
  if (arg === '--help' || arg === '-h') {
    printUsage();
    return;
  }

  const fileUrl = await promptFileUrl();
  if (!fileUrl) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  const apiKey = process.env.JOTFORM_API_KEY;
  const baseUrl = process.env.JOTFORM_BASE_URL;

  if (!apiKey) {
    console.error('❌ Missing JOTFORM_API_KEY in environment (.env)');
    process.exitCode = 1;
    return;
  }

  if (!baseUrl) {
    console.warn('⚠️ JOTFORM_BASE_URL is empty; set it in .env for consistency with Jotform API usage.');
  }

  console.log('🚀 Starting Jotform upload download...');
  console.log('🌐 Fetching:', fileUrl);
  const buf = await fetchJotformUploadFileBuffer(fileUrl, apiKey);
  console.log('📄 Bytes:', buf.length);

  const outPath = resolveOutputPath(fileUrl);
  console.log('💾 Writing file...');
  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, buf);
  console.log('✅ Wrote file:', outPath);
}

main().catch((err: unknown) => {
  console.error('❌ Download failed:', err);
  process.exitCode = 1;
});
