"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.readJson = readJson;
exports.writeJson = writeJson;
const fs_1 = require("fs");
const path_1 = __importDefault(require("path"));
const IS_VERCEL = process.env.VERCEL === "1";
const BASE_DATA_DIR = path_1.default.join(process.cwd(), "src", "data");
const RUNTIME_DATA_DIR = IS_VERCEL ? path_1.default.join("/tmp", "lms-data") : BASE_DATA_DIR;
function fileFor(name) {
    return path_1.default.join(RUNTIME_DATA_DIR, `${name}.json`);
}
function sourceFileFor(name) {
    return path_1.default.join(BASE_DATA_DIR, `${name}.json`);
}
async function ensureDir() {
    await fs_1.promises.mkdir(RUNTIME_DATA_DIR, { recursive: true });
}
/** Read an array file. Returns [] if the file does not exist. */
async function readJson(name) {
    try {
        await ensureDir();
        const targetFile = fileFor(name);
        try {
            const raw = await fs_1.promises.readFile(targetFile, "utf-8");
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed : [];
        }
        catch {
            // If on Vercel and file is not yet copied to /tmp, seed from source
            if (IS_VERCEL) {
                try {
                    const initialRaw = await fs_1.promises.readFile(sourceFileFor(name), "utf-8");
                    await fs_1.promises.writeFile(targetFile, initialRaw, "utf-8");
                    const parsed = JSON.parse(initialRaw);
                    return Array.isArray(parsed) ? parsed : [];
                }
                catch {
                    return [];
                }
            }
            return [];
        }
    }
    catch {
        return [];
    }
}
/** Write an array file (pretty-printed). */
async function writeJson(name, data) {
    await ensureDir();
    await fs_1.promises.writeFile(fileFor(name), JSON.stringify(data, null, 2), "utf-8");
}
