import { describe, it, expect } from 'vitest'
import { resolveSeek } from '../resolveSeek'
import type { PlaybackEntry } from '../types'

function entry(
    order: number,
    source: 'movie' | 'commentary',
    effectiveStartMs: number,
    effectiveEndMs: number,
    globalStartMs: number,
    globalEndMs: number,
): PlaybackEntry {
    return {
        order,
        source,
        filePath: `/media/${source}/file.mkv`,
        startMs: effectiveStartMs,
        endMs: effectiveEndMs,
        effectiveStartMs,
        effectiveEndMs,
        cutId: `cut-${order}`,
        globalStartMs,
        globalEndMs,
    }
}

// s01e03-a (Deathgasm, 5 cuts, from episodes.json)
// order | source      | effStart  | effEnd    | globalStart | globalEnd
//   1   | commentary  |        0  |  30_000   |          0  |   30_000
//   2   | movie       |        0  | 300_000   |     30_000  |  330_000
//   3   | commentary  |   30_000  |  60_000   |    330_000  |  360_000
//   4   | movie       |  300_000  | 550_000   |    360_000  |  610_000
//   5   | commentary  |   60_000  |  86_000   |    610_000  |  636_000
const planA: PlaybackEntry[] = [
    entry(1, 'commentary', 0, 30_000, 0, 30_000),
    entry(2, 'movie', 0, 300_000, 30_000, 330_000),
    entry(3, 'commentary', 30_000, 60_000, 330_000, 360_000),
    entry(4, 'movie', 300_000, 550_000, 360_000, 610_000),
    entry(5, 'commentary', 60_000, 86_000, 610_000, 636_000),
]

// s01e03-b (The Changeling, 5 cuts, from episodes.json)
// order | source      | effStart  | effEnd    | globalStart | globalEnd
//   1   | commentary  |        0  |  20_000   |          0  |   20_000
//   2   | movie       |        0  | 150_000   |     20_000  |  170_000
//   3   | commentary  |   20_000  |  40_000   |    170_000  |  190_000
//   4   | movie       |  150_000  | 275_000   |    190_000  |  315_000
//   5   | commentary  |   30_000  |  46_500   |    315_000  |  331_500
const planB: PlaybackEntry[] = [
    entry(1, 'commentary', 0, 20_000, 0, 20_000),
    entry(2, 'movie', 0, 150_000, 20_000, 170_000),
    entry(3, 'commentary', 20_000, 40_000, 170_000, 190_000),
    entry(4, 'movie', 150_000, 275_000, 190_000, 315_000),
    entry(5, 'commentary', 30_000, 46_500, 315_000, 331_500),
]

describe('resolveSeek — flow for a test episode (s01e03-a)', () => {
    it('seek to 0 ms → entry 0 (commentary), fileSeekMs: 0', () => {
        const r = resolveSeek(planA, 0)
        expect(r.entryIndex).toBe(0)
        expect(r.fileSeekMs).toBe(0)
    })

    it('seek into cut 2 (100 s into movie) → entry 1, fileSeekMs: 100_000', () => {
        // globalMs: 30_000 + 100_000 = 130_000
        // fileSeekMs: effectiveStart(0) + (130_000 - 30_000) = 100_000
        const r = resolveSeek(planA, 130_000)
        expect(r.entryIndex).toBe(1)
        expect(r.fileSeekMs).toBe(100_000)
    })

    it('seek to exact cut 3 boundary → entry 2 (commentary)', () => {
        // globalMs: 330_000 — start of cut 3
        const r = resolveSeek(planA, 330_000)
        expect(r.entryIndex).toBe(2)
        expect(r.fileSeekMs).toBe(30_000) // effectiveStart + (330_000 - 330_000)
    })

    it('seek into cut 4 (second movie segment) → entry 3, fileSeekMs: 440_000', () => {
        // globalMs: 500_000 — inside entry 3 (global 360_000..610_000)
        // fileSeekMs: 300_000 + (500_000 - 360_000) = 440_000
        const r = resolveSeek(planA, 500_000)
        expect(r.entryIndex).toBe(3)
        expect(r.fileSeekMs).toBe(440_000)
    })

    it('seek into cut 5 (final commentary, s01e03-a) → entry 4', () => {
        // globalMs: 620_000 — inside entry 4 (global 610_000..636_000)
        // fileSeekMs: 60_000 + (620_000 - 610_000) = 70_000
        const r = resolveSeek(planA, 620_000)
        expect(r.entryIndex).toBe(4)
        expect(r.fileSeekMs).toBe(70_000)
    })
})

describe('resolveSeek — flow for a test episode (s01e03-b)', () => {
    it('seek into cut 4 (second movie segment) → entry 3, fileSeekMs: 210_000', () => {
        // globalMs: 250_000 — inside entry 3 (global 190_000..315_000)
        // fileSeekMs: 150_000 + (250_000 - 190_000) = 210_000
        const r = resolveSeek(planB, 250_000)
        expect(r.entryIndex).toBe(3)
        expect(r.fileSeekMs).toBe(210_000)
    })

    it('seek into cut 5 (final commentary) → entry 4, fileSeekMs: 35_000', () => {
        // globalMs: 320_000 — inside entry 4 (global 315_000..331_500)
        // fileSeekMs: 30_000 + (320_000 - 315_000) = 35_000
        const r = resolveSeek(planB, 320_000)
        expect(r.entryIndex).toBe(4)
        expect(r.fileSeekMs).toBe(35_000)
    })
})

describe('resolveSeek — offset flow', () => {
    it('positive offset (+5_000 ms on cut 1) — fileSeekMs includes offset', () => {
        // cut 1: effectiveStart=5_000 (shifted by +5_000 offset), globalStart=0
        const offsetPlan: PlaybackEntry[] = [
            { ...planA[0], effectiveStartMs: 5_000, effectiveEndMs: 35_000, globalStartMs: 0, globalEndMs: 30_000 },
        ]
        // Seek to global 10_000: fileSeekMs = 5_000 + (10_000 - 0) = 15_000
        const r = resolveSeek(offsetPlan, 10_000)
        expect(r.entryIndex).toBe(0)
        expect(r.fileSeekMs).toBe(15_000)
    })

    it('negative offset (−5_000 ms clamped) — no negative fileSeekMs', () => {
        // cut 1: effectiveStart=0 (clamped), globalStart=0, duration shrunk
        const clampedPlan: PlaybackEntry[] = [
            { ...planA[0], effectiveStartMs: 0, effectiveEndMs: 25_000, globalStartMs: 0, globalEndMs: 25_000 },
        ]
        // Seek to 0 — fileSeekMs = max(0, 0 + 0) = 0
        const r = resolveSeek(clampedPlan, 0)
        expect(r.entryIndex).toBe(0)
        expect(r.fileSeekMs).toBe(0)
    })

    it('seek target that would yield negative before clamp → fileSeekMs: 0', () => {
        // effectiveStart > globalStart somehow (edge case) — clamp prevents negative
        const weirdPlan: PlaybackEntry[] = [
            { ...planA[0], effectiveStartMs: 10_000, effectiveEndMs: 40_000, globalStartMs: 0, globalEndMs: 30_000 },
        ]
        const resolve = resolveSeek(weirdPlan, 0)
        expect(resolve.fileSeekMs).toBeGreaterThanOrEqual(0)
    })
})

describe('resolveSeek — failure flow', () => {
    it('empty entries array → { entryIndex: 0, fileSeekMs: 0 }, no throw', () => {
        const r = resolveSeek([], 0)
        expect(r).toEqual({ entryIndex: 0, fileSeekMs: 0 })
    })

    it('seek past total end → clamped to last entry, no throw', () => {
        const r = resolveSeek(planA, 999_999_999)
        expect(r.entryIndex).toBe(planA.length - 1)
        expect(r.fileSeekMs).toBe(planA[planA.length - 1].effectiveEndMs)
    })

    it('seek(-1) → technically not in any range, clamped to last entry', () => {
        // globalMs = -1 is not >= any entry's globalStartMs (0), falls through to clamp
        const r = resolveSeek(planA, -1)
        expect(r.entryIndex).toBe(planA.length - 1)
    })
})
