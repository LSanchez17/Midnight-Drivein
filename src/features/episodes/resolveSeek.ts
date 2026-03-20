import type { PlaybackEntry } from './types'

export interface SeekResult {
    entryIndex: number
    fileSeekMs: number
}

/**
 * Given a fully-resolved PlaybackEntry[] and a global seek target, returns
 * which entry to activate and where to seek within that file.
 */
export function resolveSeek(entries: PlaybackEntry[], globalMs: number): SeekResult {
    if (entries.length === 0) {
        return { entryIndex: 0, fileSeekMs: 0 }
    }

    for (let i = 0; i < entries.length; i++) {
        const entry = entries[i]
        const inRange =
            globalMs >= entry.globalStartMs && globalMs < entry.globalEndMs

        if (inRange) {
            const fileSeekMs = Math.max(
                0,
                entry.effectiveStartMs + (globalMs - entry.globalStartMs),
            )
            return { entryIndex: i, fileSeekMs }
        }
    }

    // Gets the last one
    const last = entries[entries.length - 1]

    return {
        entryIndex: entries.length - 1,
        fileSeekMs: last.effectiveEndMs,
    }
}
