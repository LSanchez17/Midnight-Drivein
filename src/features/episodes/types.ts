export type EpisodeStatus =
    | 'Ready'
    | 'Partial Match'
    | 'Missing Files'
    | 'Needs Timing Fix'

export type SourceType = 'movie' | 'commentary'

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
    /** Which configured root: 'movies' or 'commentary'. */
    folderRoot: 'movies' | 'commentary'
    sizeBytes?: number
    /** Null until probed. */
    durationMs?: number
    lastSeenAt: string
    isMissing: boolean
}

/** One of the two source files per episode (movie or commentary reel). */
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
 * producing the interleaved commentary → movie → commentary → movie experience.
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

/** One movie + commentary reel pair within a broadcast episode. */
export interface MovieSlot {
    id: string
    slot: string
    commentary?: string
    movieTitle?: string
    movieYear?: number
    movieMatch: FileMatch
    commentaryMatch: FileMatch
    cuts: PlaybackCut[]
    flaggedForTiming: boolean
}

export interface Episode {
    id: string
    title: string
    season?: number
    episode?: number
    isSpecial: boolean
    airDate?: string
    description?: string
    guests: string[]
    slots: MovieSlot[]
    status: EpisodeStatus
}

export interface PlaybackEntry {
    order: number
    source: SourceType
    /** Absolute path to the source file */
    filePath: string
    /** Raw start timestamp from the cut metadata (milliseconds) */
    startMs: number
    /** Raw end timestamp from the cut metadata (milliseconds) */
    endMs: number
    /**
     * Actual seek target after applying userOffsetMs; >= 0 always
     */
    effectiveStartMs: number
    /**
     * Actual end target after applying userOffsetMs.
     */
    effectiveEndMs: number
    cutId: string
}

export type PlaybackPlanErrorCode =
    | 'no_cuts'
    | 'missing_movie_file'
    | 'missing_commentary_file'

export interface PlaybackPlanError {
    code: PlaybackPlanErrorCode
}

export type PlaybackPlanResult =
    | { ok: true; entries: PlaybackEntry[] }
    | { ok: false; error: PlaybackPlanError }
