import type { EpisodeStatus } from '../features/episodes/types'

export interface EpisodeFilters {
    search?: string
    status?: EpisodeStatus | 'All'
    type?: 'All' | 'Episodes' | 'Specials'
}

export interface AppSettings {
    moviesFolder: string
    segmentsFolder: string
    scanOnStartup: boolean
    theme: 'dark'
}

export interface CutOffsetPatch {
    cutId: string
    offsetMs: number
}
