import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @tauri-apps/plugin-dialog so tests run outside a Tauri window.
vi.mock('@tauri-apps/plugin-dialog', () => ({
    open: vi.fn(),
}))

import { open } from '@tauri-apps/plugin-dialog'
const mockOpen = vi.mocked(open)

import { selectLibraryRoot } from '../_tauri'

beforeEach(() => {
    mockOpen.mockReset()
})

// selectLibraryRoot
describe('selectLibraryRoot', () => {
    it('returns the selected path when the user picks a folder', async () => {
        mockOpen.mockResolvedValueOnce('/Users/you/Movies')

        const result = await selectLibraryRoot()

        expect(result).toBe('/Users/you/Movies')
        expect(mockOpen).toHaveBeenCalledWith({ directory: true, multiple: false })
    })

    it('returns null when the user cancels the picker', async () => {
        mockOpen.mockResolvedValueOnce(null)

        const result = await selectLibraryRoot()

        expect(result).toBeNull()
    })

    it('returns null when the plugin returns undefined (some platforms)', async () => {
        mockOpen.mockResolvedValueOnce(undefined as unknown as null)

        const result = await selectLibraryRoot()

        expect(result).toBeNull()
    })

    it('throws ApiError with UNKNOWN code when the plugin rejects', async () => {
        mockOpen.mockRejectedValueOnce(new Error('dialog unavailable'))

        await expect(selectLibraryRoot()).rejects.toMatchObject({
            name: 'ApiError',
            code: 'UNKNOWN',
        })
    })
})

describe('mock shape compatibility', () => {
    it('selectLibraryRoot from _mock.ts returns a non-empty string', async () => {
        const { selectLibraryRoot: mockSelectRoot } = await import('../_mock')
        const result = await mockSelectRoot()
        expect(typeof result).toBe('string')
        expect(result!.length).toBeGreaterThan(0)
    })
})
