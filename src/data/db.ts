import { promises as fs } from "fs";
import path from "path";

const IS_VERCEL = process.env.VERCEL === "1";
const BASE_DATA_DIR = path.join(process.cwd(), "src", "data");
const RUNTIME_DATA_DIR = IS_VERCEL ? path.join("/tmp", "lms-data") : BASE_DATA_DIR;

function fileFor(name: string): string {
  return path.join(RUNTIME_DATA_DIR, `${name}.json`);
}

function sourceFileFor(name: string): string {
  return path.join(BASE_DATA_DIR, `${name}.json`);
}

async function ensureDir(): Promise<void> {
  await fs.mkdir(RUNTIME_DATA_DIR, { recursive: true });
}

/** Read an array file. Returns [] if the file does not exist. */
export async function readJson<T>(name: string): Promise<T[]> {
  try {
    await ensureDir();
    const targetFile = fileFor(name);
    try {
      const raw = await fs.readFile(targetFile, "utf-8");
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as T[]) : [];
    } catch {
      // If on Vercel and file is not yet copied to /tmp, seed from source
      if (IS_VERCEL) {
        try {
          const initialRaw = await fs.readFile(sourceFileFor(name), "utf-8");
          await fs.writeFile(targetFile, initialRaw, "utf-8");
          const parsed = JSON.parse(initialRaw);
          return Array.isArray(parsed) ? (parsed as T[]) : [];
        } catch {
          return [];
        }
      }
      return [];
    }
  } catch {
    return [];
  }
}

/** Write an array file (pretty-printed). */
export async function writeJson<T>(name: string, data: T[]): Promise<void> {
  await ensureDir();
  await fs.writeFile(fileFor(name), JSON.stringify(data, null, 2), "utf-8");
}
