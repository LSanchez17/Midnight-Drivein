export type EpisodeStatus =
    | 'Ready'
    | 'Partial Match'
    | 'Missing Files'
    | 'Needs Timing Fix'

export interface MovieSlot {
    title: string
    path?: string
}

export interface SegmentSlot {
    title: string
    path?: string
}

export type SlotKey = 'movie1' | 'segment1' | 'movie2' | 'segment2'

export interface FileMatch {
    slot: SlotKey
    filename?: string
    confidence?: number
    status: 'matched' | 'missing' | 'low-confidence'
}

export interface PlaybackConfig {
    offsets: {
        segment1: number
        segment2: number
    }
}

export interface Episode {
    id: string
    title: string
    season?: number
    episode?: number
    isSpecial: boolean
    airDate?: string
    description: string
    movies: [MovieSlot, MovieSlot]
    segments: [SegmentSlot, SegmentSlot]
    fileMatches: FileMatch[]
    playbackConfig: PlaybackConfig
    status: EpisodeStatus
}
