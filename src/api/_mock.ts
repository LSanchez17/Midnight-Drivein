import { MOCK_EPISODES } from '../features/episodes/mocks'
import type { Episode, SourceType } from '../features/episodes/types'
import type { EpisodeFilters, AppSettings, AppSettingsPatch, ScanResult, MediaFileSummary } from './types'

export function getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
    return new Promise((resolve) =>
        setTimeout(() => {
            let results = [...MOCK_EPISODES]

            if (filters?.search) {
                const q = filters.search.toLowerCase()
                results = results.filter(
                    (e) =>
                        e.title.toLowerCase().includes(q) ||
                        e.slots.some((s) =>
                            (s.movieTitle ?? '').toLowerCase().includes(q) ||
                            (s.movieMatch.displayName ?? s.movieMatch.filename ?? '').toLowerCase().includes(q),
                        ),
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

export function savePlaybackOverride(_slotId: string, _flaggedForTiming: boolean): Promise<void> {
    return Promise.resolve()
}

export function remapFile(_slotId: string, _fileType: SourceType, _mediaFileId: string): Promise<void> {
    return Promise.resolve()
}

export function scanLibrary(): Promise<ScanResult> {
    return Promise.resolve({
        lastScanAt: new Date().toISOString(),
        movieFileCount: 3,
        segmentFileCount: 2,
        errors: [],
        missingFolders: [],
        matchSummary: { matched: 0, lowConfidence: 0, missing: 0 },
    })
}

export function getScanSummary(): Promise<ScanResult | null> {
    return Promise.resolve(null)
}

export function selectLibraryRoot(): Promise<string | null> {
    return Promise.resolve('/mock/movies')
}

export function listMediaFiles(
    _folderRoot: 'movies' | 'segments',
): Promise<MediaFileSummary[]> {
    return Promise.resolve([])
}
