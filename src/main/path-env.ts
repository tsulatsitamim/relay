import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function mergePath(loginPath: string, current: string): string {
  const parts = [...loginPath.split(":"), ...current.split(":")].filter(Boolean);
  return [...new Set(parts)].join(":");
}

export async function applyLoginPath(): Promise<void> {
  if (process.platform !== "darwin") return;
  try {
    const shell = process.env.SHELL || "/bin/zsh";
    const { stdout } = await execFileAsync(shell, ["-l", "-c", "echo -n $PATH"], {
      timeout: 5000,
      env: {
        HOME: process.env.HOME,
        USER: process.env.USER,
        LOGNAME: process.env.LOGNAME,
        TMPDIR: process.env.TMPDIR,
        SHELL: shell,
      },
    });
    const loginPath = stdout.trim();
    if (loginPath) {
      process.env.PATH = mergePath(loginPath, process.env.PATH ?? "");
    }
  } catch {
    // Keep the process PATH if the login shell cannot be probed.
  }
}
