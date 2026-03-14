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
