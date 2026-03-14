import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Episode } from '../../features/episodes/types'
import { invoke } from '@tauri-apps/api/core'
import { getEpisodes, getEpisodeById } from '../_tauri'

// Mock @tauri-apps/api/core so tests run outside of a Tauri window.
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

/** Minimal EpisodeRow wire shape returned by Rust. */
function makeRow(id: string, title: string) {
    return {
        id,
        title,
        season: null,
        episode: null,
        isSpecial: false,
        airDate: null,
        description: null,
        movieMatch: {
            fileType: 'movie',
            filename: null,
            displayName: null,
            path: null,
            confidence: null,
            status: 'missing',
            isUserOverridden: false,
            matchedAt: null,
        },
        segmentMatch: {
            fileType: 'segment',
            filename: null,
            displayName: null,
            path: null,
            confidence: null,
            status: 'missing',
            isUserOverridden: false,
            matchedAt: null,
        },
        cuts: [],
        flaggedForTiming: false,
    }
}

beforeEach(() => {
    mockInvoke.mockReset()
})

describe('getEpisodes', () => {
    it('returns an Episode array with status derived client-side', async () => {
        const rows = [makeRow('ep-1', 'Pilot'), makeRow('ep-2', 'Sequel')]
        mockInvoke.mockResolvedValueOnce(rows)

        const episodes = await getEpisodes()

        expect(episodes).toHaveLength(2)
        expect(episodes[0].title).toBe('Pilot')
        // status must be present on the domain object
        expect(episodes[0].status).toBeDefined()
    })

    it('derives Missing Files status when both matches are missing', async () => {
        mockInvoke.mockResolvedValueOnce([makeRow('ep-1', 'Pilot')])

        const episodes = await getEpisodes()
        expect(episodes[0].status).toBe('Missing Files')
    })

    it('derives Ready status when both files are matched and no offsets', async () => {
        const row = {
            ...makeRow('ep-1', 'Pilot'),
            movieMatch: {
                fileType: 'movie',
                filename: 'movie.mp4',
                displayName: null,
                path: '/movies/movie.mp4',
                confidence: 0.95,
                status: 'matched',
                isUserOverridden: false,
                matchedAt: '2024-01-01T00:00:00Z',
            },
            segmentMatch: {
                fileType: 'segment',
                filename: 'seg.mp4',
                displayName: null,
                path: '/segments/seg.mp4',
                confidence: 0.95,
                status: 'matched',
                isUserOverridden: false,
                matchedAt: '2024-01-01T00:00:00Z',
            },
        }
        mockInvoke.mockResolvedValueOnce([row])

        const episodes = await getEpisodes()
        expect(episodes[0].status).toBe('Ready')
    })

    it('EpisodeStatus is never present on the wire rows — derived only on client', async () => {
        // Confirm the raw row has no 'status' field before conversion.
        const row = makeRow('ep-1', 'Pilot')
        expect((row as Record<string, unknown>)['status']).toBeUndefined()

        mockInvoke.mockResolvedValueOnce([row])
        const episodes = await getEpisodes()
        // But after adapter, status IS present.
        expect(episodes[0].status).toBeDefined()
    })

    it('throws ApiError with UNKNOWN code on invoke rejection', async () => {
        mockInvoke.mockRejectedValueOnce('some unexpected error')

        await expect(getEpisodes()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'UNKNOWN',
        })
    })

    it('parses DB_ERROR prefix from rejected error string', async () => {
        mockInvoke.mockRejectedValueOnce('DB_ERROR: database is locked')

        await expect(getEpisodes()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'DB_ERROR',
        })
    })
})

describe('getEpisodeById', () => {
    it('returns undefined when Rust returns null', async () => {
        mockInvoke.mockResolvedValueOnce(null)
        const result = await getEpisodeById('no-such-id')
        expect(result).toBeUndefined()
    })

    it('returns an Episode with derived status when row is found', async () => {
        mockInvoke.mockResolvedValueOnce(makeRow('ep-1', 'Pilot'))
        const result = await getEpisodeById('ep-1')
        expect(result).toBeDefined()
        expect((result as Episode).title).toBe('Pilot')
        expect((result as Episode).status).toBeDefined()
    })
})

// Mock shape-compatibility (ensures _mock.ts exports same contract)
describe('mock shape compatibility', () => {
    it('getEpisodes from _mock.ts resolves to Episode[]', async () => {
        const { getEpisodes: mockGetEpisodes } = await import('../_mock')
        const result = await mockGetEpisodes()
        expect(Array.isArray(result)).toBe(true)
        if (result.length > 0) {
            expect(result[0]).toHaveProperty('id')
            expect(result[0]).toHaveProperty('status')
        }
    })

    it('getEpisodeById from _mock.ts returns Episode or undefined', async () => {
        const { getEpisodeById: mockGetById } = await import('../_mock')
        const result = await mockGetById('non-existent')
        expect(result).toBeUndefined()
    })
})
