import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, resolve, sep } from "node:path";
import { env } from "../config/env";
import { hmac, hmacEquals } from "../lib/hash";
import type { ObjectStorage } from "./types";

// 개발용 디스크 저장소. 파일은 정적으로 공개하지 않고, HMAC 서명이 맞는 /files 요청만 내려준다.

const root = resolve(import.meta.dirname, "../..", env.STORAGE_LOCAL_DIR);

/** 키를 저장 위치 안의 경로로 바꾼다. ../ 같은 경로 조작은 거부한다. */
export function resolveKey(key: string): string | null {
  if (!/^[\w\-./]+$/.test(key) || key.includes("..")) return null;
  const path = resolve(root, key);
  return path.startsWith(root + sep) ? path : null;
}

const signature = (key: string, exp: number) => hmac(`file:${key}:${exp}`);

export function verifySignature(key: string, exp: number, sig: string): boolean {
  return (
    Number.isFinite(exp) &&
    exp * 1000 > Date.now() &&
    /^[0-9a-f]{64}$/.test(sig) &&
    hmacEquals(`file:${key}:${exp}`, sig)
  );
}

export async function readLocalFile(key: string): Promise<Buffer | null> {
  const path = resolveKey(key);
  if (!path) return null;
  return readFile(path).catch(() => null);
}

export const localStorage: ObjectStorage = {
  async put(key, data) {
    const path = resolveKey(key);
    if (!path) throw new Error(`잘못된 저장 키: ${key}`);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
  },

  async signedUrl(key, ttlSeconds) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const query = new URLSearchParams({ exp: String(exp), sig: signature(key, exp) });
    return `${env.PUBLIC_BASE_URL}/files/${key}?${query}`;
  },

  async delete(key) {
    const path = resolveKey(key);
    if (path) await rm(path, { force: true });
  },
};
