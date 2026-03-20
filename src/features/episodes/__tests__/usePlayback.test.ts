import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { usePlayback } from '../usePlayback'
import type { PlaybackEntry, SourceType } from '../types'

vi.mock('@tauri-apps/api/core', () => ({
    convertFileSrc: (path: string) => `asset://${path}`,
}))

const mockGetPlaybackPlan = vi.fn<(episodeId: string, slot: string) => Promise<PlaybackEntry[]>>()
vi.mock('../../../api', () => ({
    getPlaybackPlan: (episodeId: string, slot: string) => mockGetPlaybackPlan(episodeId, slot),
}))

function makeEntry(order: number, source: SourceType, startMs: number, endMs: number, filePath: string): PlaybackEntry {
    return { order, source, filePath, cutId: `c${order}`, startMs, endMs, effectiveStartMs: startMs, effectiveEndMs: endMs, globalStartMs: startMs, globalEndMs: endMs }
}

const PLAN_A: PlaybackEntry[] = [
    makeEntry(1, 'commentary', 0, 60_000, '/files/commentary.mkv'),
    makeEntry(2, 'movie', 60_000, 150_000, '/files/movie.mkv'),
    makeEntry(3, 'commentary', 150_000, 210_000, '/files/commentary.mkv'),
    makeEntry(4, 'movie', 210_000, 4_920_000, '/files/movie.mkv'),
]

interface VideoMock {
    src: string
    currentTime: number
    onloadedmetadata: (() => void) | null
    play: ReturnType<typeof vi.fn>
    pause: ReturnType<typeof vi.fn>
    addEventListener: ReturnType<typeof vi.fn>
    removeEventListener: ReturnType<typeof vi.fn>
    fireTimeUpdate(ms: number): void
    fireEnded(): void
}

function makeVideoMock(): VideoMock {
    const listeners: Record<string, EventListener[]> = {}
    const mock: VideoMock = {
        src: '', currentTime: 0, onloadedmetadata: null,
        play: vi.fn(async () => { }),
        pause: vi.fn(),
        addEventListener: vi.fn((event: string, cb: EventListener) => { listeners[event] = listeners[event] ?? []; listeners[event].push(cb) }),
        removeEventListener: vi.fn((event: string, cb: EventListener) => { listeners[event] = (listeners[event] ?? []).filter((l) => l !== cb) }),
        fireTimeUpdate(ms: number) { mock.currentTime = ms / 1000; (listeners['timeupdate'] ?? []).forEach((cb) => cb(new Event('timeupdate'))) },
        fireEnded() { (listeners['ended'] ?? []).forEach((cb) => cb(new Event('ended'))) },
    }
    return mock
}

function injectRefs(result: { current: ReturnType<typeof usePlayback> }, movieMock: VideoMock, commMock: VideoMock) {
    ; (result.current.movieVideoRef as { current: unknown }).current = movieMock
        ; (result.current.commentaryVideoRef as { current: unknown }).current = commMock
}

describe('usePlayback', () => {
    let movieMock: VideoMock
    let commMock: VideoMock

    beforeEach(() => {
        mockGetPlaybackPlan.mockReset()
        movieMock = makeVideoMock()
        commMock = makeVideoMock()
    })

    it('loadPlan sets initial state', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        expect(result.current.loadingPlan).toBe(false)
        expect(result.current.plan).toHaveLength(4)
        expect(result.current.activeEntryIndex).toBe(0)
        expect(result.current.activeSource).toBe('commentary')
        expect(result.current.totalDurationMs).toBe(4_920_000)
        expect(result.current.error).toBeNull()
    })

    it('loadPlan sets loading=true then false', async () => {
        let resolve: (v: PlaybackEntry[]) => void = () => { }
        mockGetPlaybackPlan.mockReturnValueOnce(new Promise((r) => { resolve = r }))
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        act(() => { void result.current.loadPlan('s01e03', 'a') })
        expect(result.current.loadingPlan).toBe(true)
        await act(async () => { resolve(PLAN_A) })
        expect(result.current.loadingPlan).toBe(false)
    })

    it('loadPlan sets error on rejection', async () => {
        const { ApiError } = await import('../../../api/errors')
        mockGetPlaybackPlan.mockRejectedValueOnce(new ApiError('NOT_FOUND', 'not found'))
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('bad', 'a') })
        expect(result.current.error).toBe('not found')
        expect(result.current.plan).toBeNull()
    })

    it('play() delegates to commentary video (entry 0)', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.play() })
        expect(commMock.play).toHaveBeenCalled()
        expect(result.current.playing).toBe(true)
    })

    it('pause() stops the active video', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.play() })
        act(() => { result.current.pause() })
        expect(commMock.pause).toHaveBeenCalled()
        expect(result.current.playing).toBe(false)
    })

    it('seek(0) sets currentTime on commentary video', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.seek(0) })
        expect(commMock.currentTime).toBe(0)
        expect(result.current.activeEntryIndex).toBe(0)
    })

    it('seek(-5000) clamps to 0', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.seek(-5_000) })
        expect(result.current.activeEntryIndex).toBe(0)
        expect(commMock.currentTime).toBe(0)
    })

    it('seek past end lands on last entry', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.seek(9_999_999) })
        expect(result.current.activeEntryIndex).toBe(3)
    })

    it('timeupdate near cut boundary triggers transition', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { commMock.fireTimeUpdate(59_980) })
        expect(result.current.activeEntryIndex).toBe(1)
        expect(result.current.activeSource).toBe('movie')
        expect(movieMock.play).toHaveBeenCalled()
    })

    it('second timeupdate at boundary does not double-advance', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => {
            commMock.fireTimeUpdate(59_980)
            commMock.fireTimeUpdate(59_990)
        })
        expect(result.current.activeEntryIndex).toBe(1)
    })

    it('ended event triggers transition as fallback', async () => {
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback())
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { commMock.fireEnded() })
        expect(result.current.activeEntryIndex).toBe(1)
        expect(movieMock.play).toHaveBeenCalled()
    })

    it('onSlotEnd fires when final entry ends via ended event', async () => {
        const onSlotEnd = vi.fn()
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback({ onSlotEnd }))
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.seek(4_000_000) })
        act(() => { movieMock.fireEnded() })
        expect(onSlotEnd).toHaveBeenCalledTimes(1)
        expect(result.current.playing).toBe(false)
    })

    it('onSlotEnd fires on timeupdate at final boundary', async () => {
        const onSlotEnd = vi.fn()
        mockGetPlaybackPlan.mockResolvedValueOnce(PLAN_A)
        const { result } = renderHook(() => usePlayback({ onSlotEnd }))
        injectRefs(result, movieMock, commMock)
        await act(async () => { await result.current.loadPlan('s01e03', 'a') })
        act(() => { result.current.seek(4_000_000) })
        act(() => { movieMock.fireTimeUpdate(4_919_960) })
        expect(onSlotEnd).toHaveBeenCalledTimes(1)
    })
})
