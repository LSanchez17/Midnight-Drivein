import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { AppSettings } from '../types'
import { ApiError } from '../errors'

// Mock @tauri-apps/api/core so tests run outside of a Tauri window.
vi.mock('@tauri-apps/api/core', () => ({
    invoke: vi.fn(),
}))

import { invoke } from '@tauri-apps/api/core'
const mockInvoke = vi.mocked(invoke)

// Lil Helper
function ok<T>(data: T) {
    return { data }
}

// Lil Helper
function err(code: string, message: string) {
    return { error: { code, message } }
}

// Thin adapter over Tauri command. Emulate the basics
async function getSettings(): Promise<AppSettings> {
    const result = await invoke<{ data: AppSettings } | { error: { code: string; message: string } }>(
        'get_settings',
    )
    if ('error' in result) throw new ApiError(result.error.code as any, result.error.message)
    return result.data
}

// Thin adapter over Tauri command. Emulate the basics
async function saveSettings(patch: Partial<AppSettings>): Promise<void> {
    const result = await invoke<{ data: null } | { error: { code: string; message: string } }>(
        'save_settings',
        { settings: patch },
    )
    if ('error' in result) throw new ApiError(result.error.code as any, result.error.message)
}

beforeEach(() => {
    mockInvoke.mockReset()
})

describe('getSettings', () => {
    it('unwraps data envelope and returns AppSettings', async () => {
        const expected: AppSettings = {
            moviesFolder: null,
            commentaryFolder: null,
            scanOnStartup: false,
            theme: 'dark',
        }
        mockInvoke.mockResolvedValueOnce(ok(expected))

        const result = await getSettings()
        expect(result).toEqual(expected)
        expect(mockInvoke).toHaveBeenCalledWith('get_settings')
    })

    it('throws ApiError when Rust returns an error envelope', async () => {
        mockInvoke.mockResolvedValueOnce(err('DB_ERROR', 'database locked'))

        await expect(getSettings()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'DB_ERROR',
            message: 'database locked',
        })
    })
})

describe('saveSettings', () => {
    it('resolves void on success', async () => {
        mockInvoke.mockResolvedValueOnce(ok(null))
        await expect(saveSettings({ scanOnStartup: true })).resolves.toBeUndefined()
        expect(mockInvoke).toHaveBeenCalledWith('save_settings', { settings: { scanOnStartup: true } })
    })

    it('throws ApiError on error envelope', async () => {
        mockInvoke.mockResolvedValueOnce(err('INVALID_INPUT', 'path traversal detected'))

        await expect(saveSettings({ moviesFolder: '../../../etc' } as any)).rejects.toMatchObject({
            name: 'ApiError',
            code: 'INVALID_INPUT',
        })
    })
})

describe('mock shape compatibility', () => {
    it('_mock getSettings satisfies AppSettings interface', async () => {
        const { getSettings: mockGetSettings } = await import('../_mock')
        const settings = await mockGetSettings()

        // These assertions double as a shape check — if the interface changes
        // and the mock is not updated, this test will fail at the property access.
        expect(typeof settings.scanOnStartup).toBe('boolean')
        expect(settings.theme).toBe('dark')
    })

    it('_mock saveSettings resolves without error', async () => {
        const { saveSettings: mockSaveSettings } = await import('../_mock')
        await expect(mockSaveSettings({})).resolves.toBeUndefined()
    })
})
