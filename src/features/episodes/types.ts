export type EpisodeStatus =
    | 'Ready'
    | 'Partial Match'
    | 'Missing Files'
    | 'Needs Timing Fix'

export type SourceType = 'movie' | 'segment'

export type MatchStatus = 'matched' | 'low-confidence' | 'missing'

/**
 * Represents a physical file discovered on disk during a library scan.
 * Not deleted on unmatch — persists so it can be re-matched without re-scanning.
 */
export interface MediaFile {
    id: string
    filename: string
    /** User-editable display name; falls back to filename when null. */
    displayName?: string
    path: string
    /** Which configured root: 'movies' or 'segments'. */
    folderRoot: 'movies' | 'segments'
    sizeBytes?: number
    /** Null until probed. */
    durationMs?: number
    lastSeenAt: string
    isMissing: boolean
}

/** One of the two source files per episode (movie or segment reel). */
export interface FileMatch {
    fileType: SourceType
    filename?: string
    /** User-editable display name; falls back to filename when null. */
    displayName?: string
    path?: string
    confidence?: number
    status: MatchStatus
    isUserOverridden: boolean
    /** ISO timestamp; absent if no file was ever assigned. */
    matchedAt?: string
}

/**
 * One timed cut into a source file. Cuts are played in sort_order sequence,
 * producing the interleaved segment → movie → segment → movie experience.
 * Timestamps stored as integer milliseconds; displayed as HH:MM:SS in the UI.
 */
export interface PlaybackCut {
    id: string
    sortOrder: number
    sourceType: SourceType
    startMs: number
    endMs: number
    userOffsetMs: number
}

export interface Episode {
    id: string
    title: string
    season?: number
    episode?: number
    isSpecial: boolean
    airDate?: string
    description?: string
    movieMatch: FileMatch
    segmentMatch: FileMatch
    cuts: PlaybackCut[]
    flaggedForTiming: boolean
    status: EpisodeStatus
}
