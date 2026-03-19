import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { saveCutOffset, savePlaybackOverride, remapFile, listMediaFiles, scanLibrary } from '../_tauri'

// Mock @tauri-apps/api/core so tests run outside of a Tauri window.
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

beforeEach(() => {
    mockInvoke.mockReset()
})

describe('saveCutOffset', () => {
    it('resolves on success', async () => {
        mockInvoke.mockResolvedValueOnce(undefined)
        await expect(saveCutOffset('cut-1', 500)).resolves.toBeUndefined()
        expect(mockInvoke).toHaveBeenCalledWith('save_cut_offset', { cutId: 'cut-1', offsetMs: 500 })
    })

    it('throws ApiError with NOT_FOUND code on mocked error', async () => {
        mockInvoke.mockRejectedValueOnce("NOT_FOUND: playback_cut with id 'cut-99' does not exist")

        await expect(saveCutOffset('cut-99', 0)).rejects.toMatchObject({
            name: 'ApiError',
            code: 'NOT_FOUND',
        })
    })

    it('throws ApiError with INVALID_INPUT code on out-of-range offset', async () => {
        mockInvoke.mockRejectedValueOnce('INVALID_INPUT: offsetMs must be in range −3600000..3600000')

        await expect(saveCutOffset('cut-1', 9_000_000)).rejects.toMatchObject({
            name: 'ApiError',
            code: 'INVALID_INPUT',
        })
    })
})

describe('savePlaybackOverride', () => {
    it('resolves on success', async () => {
        mockInvoke.mockResolvedValueOnce(undefined)
        await expect(savePlaybackOverride('s01e01-a', true)).resolves.toBeUndefined()
        expect(mockInvoke).toHaveBeenCalledWith('save_playback_override', {
            slotId: 's01e01-a',
            flaggedForTiming: true,
        })
    })

    it('throws ApiError with NOT_FOUND on missing slot', async () => {
        mockInvoke.mockRejectedValueOnce("NOT_FOUND: movie_slot with id 'bad-slot' does not exist")

        await expect(savePlaybackOverride('bad-slot', false)).rejects.toMatchObject({
            name: 'ApiError',
            code: 'NOT_FOUND',
        })
    })
})

describe('remapFile', () => {
    it('resolves on success', async () => {
        mockInvoke.mockResolvedValueOnce(undefined)
        await expect(remapFile('s01e01-a', 'movie', 'mf-1')).resolves.toBeUndefined()
        expect(mockInvoke).toHaveBeenCalledWith('remap_file', {
            slotId: 's01e01-a',
            fileType: 'movie',
            mediaFileId: 'mf-1',
        })
    })

    it('throws ApiError with NOT_FOUND when mediaFileId is invalid', async () => {
        mockInvoke.mockRejectedValueOnce("NOT_FOUND: media_file with id 'mf-999' does not exist")

        await expect(remapFile('s01e01-a', 'movie', 'mf-999')).rejects.toMatchObject({
            name: 'ApiError',
            code: 'NOT_FOUND',
        })
    })

    it('throws ApiError with INVALID_INPUT for bad file_type', async () => {
        mockInvoke.mockRejectedValueOnce('INVALID_INPUT: file_type must be \'movie\' or \'commentary\'')

        // @ts-expect-error Testing invalid input
        await expect(remapFile('s01e01-a', 'unknown', 'mf-1')).rejects.toMatchObject({
            name: 'ApiError',
            code: 'INVALID_INPUT',
        })
    })
})

describe('listMediaFiles', () => {
    it('invokes list_media_files with folderRoot', async () => {
        mockInvoke.mockResolvedValueOnce([])
        await listMediaFiles('movies')
        expect(mockInvoke).toHaveBeenCalledWith('list_media_files', { folderRoot: 'movies' })
    })

    it('returns an array of MediaFileSummary', async () => {
        const file = {
            id: 'mf-1',
            filename: 'movie.mkv',
            displayName: 'My Movie',
            path: '/media/movies/movie.mkv',
            sizeBytes: 1_073_741_824,
            lastSeenAt: '2026-03-16T00:00:00Z',
        }
        mockInvoke.mockResolvedValueOnce([file])
        const result = await listMediaFiles('movies')
        expect(result).toEqual([file])
    })

    it('coerces null displayName to undefined', async () => {
        mockInvoke.mockResolvedValueOnce([{
            id: 'mf-2',
            filename: 'seg.mkv',
            displayName: null,
            path: '/media/segments/seg.mkv',
            sizeBytes: 512,
            lastSeenAt: '2026-03-16T00:00:00Z',
        }])
        const [row] = await listMediaFiles('commentary')
        expect(row.displayName).toBeUndefined()
    })

    it('throws ApiError with INVALID_INPUT for unknown folder root', async () => {
        mockInvoke.mockRejectedValueOnce('INVALID_INPUT: folder_root must be \'movies\' or \'commentary\'')

        // @ts-expect-error Testing invalid input
        await expect(listMediaFiles('other')).rejects.toMatchObject({
            name: 'ApiError',
            code: 'INVALID_INPUT',
        })
    })
})

describe('scanLibrary', () => {
    it('resolves with ScanResult on success', async () => {
        const mockResult = {
            lastScanAt: '2026-03-16T00:00:00Z',
            movieFileCount: 2,
            commentaryFileCount: 1,
            errors: [],
            missingFolders: [],
        }
        mockInvoke.mockResolvedValueOnce(mockResult)
        await expect(scanLibrary()).resolves.toEqual(mockResult)
        expect(mockInvoke).toHaveBeenCalledWith('scan_library')
    })

    it('throws ApiError with SCAN_IN_PROGRESS on double-call error', async () => {
        mockInvoke.mockRejectedValueOnce('SCAN_IN_PROGRESS: a scan is already running')

        await expect(scanLibrary()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'SCAN_IN_PROGRESS',
        })
    })

    it('throws ApiError with IO_ERROR when folders not configured', async () => {
        mockInvoke.mockRejectedValueOnce(
            'IO_ERROR: movies_folder and commentary_folder must both be configured before scanning',
        )

        await expect(scanLibrary()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'IO_ERROR',
        })
    })
})

describe('mock shape compatibility', () => {
    it('saveCutOffset from _mock.ts resolves void', async () => {
        const { saveCutOffset: mockSaveCut } = await import('../_mock')
        await expect(mockSaveCut('cut-1', 100)).resolves.toBeUndefined()
    })

    it('scanLibrary from _mock.ts resolves with ScanResult', async () => {
        const { scanLibrary: mockScan } = await import('../_mock')
        const result = await mockScan()
        expect(typeof result.movieFileCount).toBe('number')
        expect(typeof result.commentaryFileCount).toBe('number')
        expect(Array.isArray(result.errors)).toBe(true)
        expect(Array.isArray(result.missingFolders)).toBe(true)
    })

    it('listMediaFiles from _mock.ts resolves to empty array', async () => {
        const { listMediaFiles: mockList } = await import('../_mock')
        const result = await mockList('movies')
        expect(Array.isArray(result)).toBe(true)
    })

    it('getPlaybackPlan from _mock.ts returns PlaybackEntry[] for s01e03-a', async () => {
        const { getPlaybackPlan: mockPlan } = await import('../_mock')
        const entries = await mockPlan('s01e03', 'a')
        expect(Array.isArray(entries)).toBe(true)
        expect(entries.length).toBe(4)
        entries.forEach((e) => {
            expect(e.filePath).toBeTruthy()
            expect(typeof e.effectiveStartMs).toBe('number')
        })
    })

    it('getPlaybackPlan from _mock.ts rejects for unknown episode', async () => {
        const { getPlaybackPlan: mockPlan } = await import('../_mock')
        await expect(mockPlan('no-such-episode', 'a')).rejects.toMatchObject({
            name: 'ApiError',
            code: 'NOT_FOUND',
        })
    })
})
