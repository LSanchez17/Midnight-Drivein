import { describe, it, expect, vi, beforeEach } from 'vitest'
import { invoke } from '@tauri-apps/api/core'
import { getScanSummary, scanLibrary } from '../_tauri'
import type { ScanResult } from '../types'

vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}))

const mockInvoke = vi.mocked(invoke)

const mockScanResult: ScanResult = {
    lastScanAt: '2026-03-16T14:00:00Z',
    movieFileCount: 3,
    segmentFileCount: 2,
    errors: [],
    missingFolders: [],
    matchSummary: { matched: 2, lowConfidence: 1, missing: 0 },
}

beforeEach(() => {
    mockInvoke.mockReset()
})

describe('scanLibrary', () => {
    it('returns ScanResult on success', async () => {
        mockInvoke.mockResolvedValueOnce(mockScanResult)
        const result = await scanLibrary()
        expect(result).toEqual(mockScanResult)
        expect(mockInvoke).toHaveBeenCalledWith('scan_library')
    })

    it('throws ApiError with SCAN_IN_PROGRESS on concurrent scan', async () => {
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

describe('getScanSummary', () => {
    it('returns null when no scan has been run', async () => {
        mockInvoke.mockResolvedValueOnce(null)
        const result = await getScanSummary()
        expect(result).toBeNull()
        expect(mockInvoke).toHaveBeenCalledWith('get_scan_summary')
    })

    it('returns ScanResult when data is present', async () => {
        mockInvoke.mockResolvedValueOnce(mockScanResult)
        const result = await getScanSummary()
        expect(result).toEqual(mockScanResult)
    })

    it('throws ApiError with DB_ERROR on database failure', async () => {
        mockInvoke.mockRejectedValueOnce('DB_ERROR: database is locked')
        await expect(getScanSummary()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'DB_ERROR',
        })
    })
})

describe('mock shape compatibility', () => {
    it('_mock getScanSummary resolves to null', async () => {
        const { getScanSummary: mockGet } = await import('../_mock')
        const result = await mockGet()
        expect(result).toBeNull()
    })

    it('_mock scanLibrary resolves to a valid ScanResult shape', async () => {
        const { scanLibrary: mockScan } = await import('../_mock')
        const result = await mockScan()
        expect(typeof result.lastScanAt).toBe('string')
        expect(typeof result.movieFileCount).toBe('number')
        expect(typeof result.segmentFileCount).toBe('number')
        expect(Array.isArray(result.errors)).toBe(true)
        expect(Array.isArray(result.missingFolders)).toBe(true)
    })

    it('_mock scanLibrary includes matchSummary with numeric fields', async () => {
        const { scanLibrary: mockScan } = await import('../_mock')
        const result = await mockScan()
        expect(result.matchSummary).toBeDefined()
        expect(typeof result.matchSummary.matched).toBe('number')
        expect(typeof result.matchSummary.lowConfidence).toBe('number')
        expect(typeof result.matchSummary.missing).toBe('number')
    })
})
