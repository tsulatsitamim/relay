import { execFile } from "node:child_process";
import { userInfo } from "node:os";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const BEGIN = "__relay_path_begin__";
const END = "__relay_path_end__";
const PROBE = `printf '${BEGIN}\\n%s\\n${END}\\n' "$PATH"`;

export function mergePaths(paths: Array<string | undefined>): string {
  const parts = paths.flatMap((entry) => (entry ?? "").split(":")).filter(Boolean);
  return [...new Set(parts)].join(":");
}

export function mergePath(loginPath: string, current: string): string {
  return mergePaths([loginPath, current]);
}

export function parseProbedPath(stdout: string): string {
  const begin = stdout.indexOf(BEGIN);
  if (begin === -1) return "";
  const rest = stdout.slice(begin + BEGIN.length);
  const end = rest.indexOf(END);
  if (end === -1) return "";
  return rest.slice(0, end).trim();
}

export function resolveShell(
  env: NodeJS.ProcessEnv,
  loginShell?: string | null,
): string {
  const fromEnv = env.SHELL?.trim();
  if (fromEnv) return fromEnv;
  const fromPasswd = loginShell?.trim();
  if (fromPasswd) return fromPasswd;
  return "/bin/zsh";
}

function loginShellFromPasswd(): string {
  try {
    return userInfo().shell || "";
  } catch {
    return "";
  }
}

async function probeShell(
  shell: string,
  args: string[],
  env: Record<string, string | undefined>,
): Promise<string> {
  try {
    const { stdout } = await execFileAsync(shell, [...args, "-c", PROBE], {
      timeout: 5000,
      env,
    });
    return parseProbedPath(stdout);
  } catch {
    return "";
  }
}

export async function applyLoginPath(
  target: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
  loginShell: string = loginShellFromPasswd(),
): Promise<void> {
  if (platform !== "darwin") return;
  const shell = resolveShell(target, loginShell);
  const env = {
    HOME: target.HOME,
    USER: target.USER,
    LOGNAME: target.LOGNAME,
    TMPDIR: target.TMPDIR,
    SHELL: shell,
  };
  const probed = await Promise.all([
    probeShell(shell, ["-l"], env),
    probeShell(shell, ["-i"], env),
  ]);
  target.PATH = mergePaths([...probed, target.PATH]);
}
