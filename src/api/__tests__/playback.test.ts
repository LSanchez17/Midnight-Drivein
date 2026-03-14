import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { saveCutOffset, savePlaybackOverride, remapFile, scanLibrary } from '../_tauri'

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
        await expect(savePlaybackOverride('ep-1', true)).resolves.toBeUndefined()
        expect(mockInvoke).toHaveBeenCalledWith('save_playback_override', {
            episodeId: 'ep-1',
            flaggedForTiming: true,
        })
    })

    it('throws ApiError with NOT_FOUND on missing episode', async () => {
        mockInvoke.mockRejectedValueOnce("NOT_FOUND: episode with id 'ep-999' does not exist")

        await expect(savePlaybackOverride('ep-999', false)).rejects.toMatchObject({
            name: 'ApiError',
            code: 'NOT_FOUND',
        })
    })
})

describe('remapFile', () => {
    it('resolves on success', async () => {
        mockInvoke.mockResolvedValueOnce(undefined)
        await expect(remapFile('ep-1', 'movie', 'mf-1')).resolves.toBeUndefined()
        expect(mockInvoke).toHaveBeenCalledWith('remap_file', {
            episodeId: 'ep-1',
            fileType: 'movie',
            mediaFileId: 'mf-1',
        })
    })

    it('throws ApiError with NOT_FOUND when mediaFileId is invalid', async () => {
        mockInvoke.mockRejectedValueOnce("NOT_FOUND: media_file with id 'mf-999' does not exist")

        await expect(remapFile('ep-1', 'movie', 'mf-999')).rejects.toMatchObject({
            name: 'ApiError',
            code: 'NOT_FOUND',
        })
    })
})

describe('scanLibrary', () => {
    it('resolves on success', async () => {
        mockInvoke.mockResolvedValueOnce(undefined)
        await expect(scanLibrary()).resolves.toBeUndefined()
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
            'IO_ERROR: movies_folder and segments_folder must both be configured before scanning',
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

    it('scanLibrary from _mock.ts resolves void', async () => {
        const { scanLibrary: mockScan } = await import('../_mock')
        await expect(mockScan()).resolves.toBeUndefined()
    })
})
