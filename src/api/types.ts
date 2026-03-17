import type { EpisodeStatus } from '../features/episodes/types'

export interface EpisodeFilters {
    search?: string
    status?: EpisodeStatus | 'All'
    type?: 'All' | 'Episodes' | 'Specials'
}

export interface AppSettings {
    moviesFolder: string | null
    segmentsFolder: string | null
    scanOnStartup: boolean
    theme: 'dark'
}

export interface AppSettingsPatch {
    moviesFolder?: string | null
    segmentsFolder?: string | null
    scanOnStartup?: boolean
    theme?: 'dark'
}

export interface MatchSummary {
    matched: number
    lowConfidence: number
    missing: number
}

export interface ScanResult {
    lastScanAt: string
    movieFileCount: number
    segmentFileCount: number
    errors: string[]
    missingFolders: string[]
    matchSummary: MatchSummary
}

export interface MediaFileSummary {
    id: string
    filename: string
    displayName: string | undefined
    path: string
    sizeBytes: number | undefined
    lastSeenAt: string
}
