import { MOCK_EPISODES } from '../features/episodes/mocks'
import type { Episode, SourceType } from '../features/episodes/types'
import type { EpisodeFilters, AppSettings, AppSettingsPatch } from './types'

export function getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
    return new Promise((resolve) =>
        setTimeout(() => {
            let results = [...MOCK_EPISODES]

            if (filters?.search) {
                const q = filters.search.toLowerCase()
                results = results.filter(
                    (e) =>
                        e.title.toLowerCase().includes(q) ||
                        (e.movieMatch.displayName ?? e.movieMatch.filename ?? '').toLowerCase().includes(q),
                )
            }

            if (filters?.status && filters.status !== 'All') {
                results = results.filter((e) => e.status === filters.status)
            }

            if (filters?.type === 'Specials') {
                results = results.filter((e) => e.isSpecial)
            } else if (filters?.type === 'Episodes') {
                results = results.filter((e) => !e.isSpecial)
            }

            resolve(results)
        }, 300),
    )
}

export function getEpisodeById(id: string): Promise<Episode | undefined> {
    return new Promise((resolve) =>
        setTimeout(() => resolve(MOCK_EPISODES.find((e) => e.id === id)), 200),
    )
}

export function getSettings(): Promise<AppSettings> {
    return Promise.resolve({ moviesFolder: null, segmentsFolder: null, scanOnStartup: false, theme: 'dark' })
}

export function saveSettings(_patch: AppSettingsPatch): Promise<void> {
    return Promise.resolve()
}

export function saveCutOffset(_cutId: string, _offsetMs: number): Promise<void> {
    return Promise.resolve()
}

export function savePlaybackOverride(_episodeId: string, _flaggedForTiming: boolean): Promise<void> {
    return Promise.resolve()
}

export function remapFile(_episodeId: string, _fileType: SourceType, _mediaFileId: string): Promise<void> {
    return Promise.resolve()
}

export function scanLibrary(): Promise<void> {
    return Promise.resolve()
}

export function selectLibraryRoot(): Promise<string | null> {
    return Promise.resolve('/mock/movies')
}
