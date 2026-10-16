import { localStorage } from "./local";
import type { ObjectStorage } from "./types";

export type { ObjectStorage } from "./types";

/** STORAGE_DRIVER에 따라 고른다. 지금은 local만 있다. */
export const storage: ObjectStorage = localStorage;
