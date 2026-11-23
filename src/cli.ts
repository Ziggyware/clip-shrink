import { spawnSync } from "node:child_process";
import { sanitizeClipboard } from "./clipboardSanitizer";

function readWindowsClipboard(): Promise<string> {
  const res = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; Get-Clipboard -Raw",
    ],
    { encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );

  if (res.error) {
    return Promise.reject(res.error);
  }
  if (res.status !== 0) {
    return Promise.reject(new Error(res.stderr.trim() || `PowerShell exited with code ${res.status}`));
  }
  return Promise.resolve(res.stdout);
}

function writeWindowsClipboard(text: string): void {
  const res = spawnSync(
    "powershell.exe",
    [
      "-NoProfile",
      "-Command",
      "[Console]::InputEncoding = [System.Text.Encoding]::UTF8; Set-Clipboard -Value ([Console]::In.ReadToEnd())",
    ],
    { input: text, encoding: "utf-8", maxBuffer: 64 * 1024 * 1024 }
  );

  if (res.error) throw res.error;
  if (res.status !== 0) {
    throw new Error(res.stderr.trim() || `PowerShell exited with code ${res.status}`);
  }
}

async function main(): Promise<void> {
  const writeBack = process.argv.includes("--write") || process.argv.includes("-w");
  const result = await sanitizeClipboard(readWindowsClipboard);

  if (!result.ok) {
    process.stderr.write(`[${result.error}] ${result.detail}\n`);
    process.exit(1);
  }

  process.stderr.write(`Detected: ${result.lang} (${(result.confidence * 100).toFixed(1)}%)\n`);

  if (writeBack) {
    writeWindowsClipboard(result.output);
    process.stderr.write("Clipboard updated.\n");
  } else {
    process.stdout.write(result.output + "\n");
  }
}

void main();