import { describe, it, expect } from 'vitest'
import { resolvePlaybackPlan } from '../resolvePlaybackPlan'
import { MOCK_EPISODES } from '../mocks'
import type { MovieSlot } from '../types'

// References s01e03 in the mock data, which has slots with cuts
const s01e03 = MOCK_EPISODES.find((e) => e.id === 's01e03')!
const slotA = s01e03.slots.find((s) => s.slot === 'a')! // Deathgasm 2015
const slotB = s01e03.slots.find((s) => s.slot === 'b')! // The Changeling 1980

describe('resolvePlaybackPlan', () => {
    it('happy path — slot a (Deathgasm, 4 cuts, both files matched)', () => {
        const result = resolvePlaybackPlan(slotA)
        expect(result.ok).toBe(true)

        if (!result.ok) return

        expect(result.entries).toHaveLength(4)
        // Verify order matches sort order
        expect(result.entries.map((e) => e.order)).toEqual([1, 2, 3, 4])
        // Verify source alternation: commentary / movie / commentary / movie
        expect(result.entries.map((e) => e.source)).toEqual([
            'commentary',
            'movie',
            'commentary',
            'movie',
        ])
        // Verify file paths are populated
        result.entries.forEach((entry) => {
            expect(entry.filePath).toBeTruthy()
            expect(entry.filePath.length).toBeGreaterThan(0)
        })
        // Spot-check first entry timestamps
        expect(result.entries[0].startMs).toBe(0)
        expect(result.entries[0].endMs).toBe(60_000)
        expect(result.entries[0].effectiveStartMs).toBe(0)
        expect(result.entries[0].effectiveEndMs).toBe(60_000)
        // Global timeline fields (all offsets are 0 and cuts are sequential)
        expect(result.entries[0].globalStartMs).toBe(0)
        expect(result.entries[0].globalEndMs).toBe(60_000)
        expect(result.entries[1].globalStartMs).toBe(60_000)
        expect(result.entries[1].globalEndMs).toBe(150_000)
        expect(result.entries[2].globalStartMs).toBe(150_000)
        expect(result.entries[2].globalEndMs).toBe(210_000)
        expect(result.entries[3].globalStartMs).toBe(210_000)
        expect(result.entries[3].globalEndMs).toBe(4_920_000)
        // Last cut has explicit endMs
        expect(result.entries[3].endMs).toBe(4_920_000)
        expect(result.entries[3].effectiveEndMs).toBe(4_920_000)
    })

    it('happy path — slot b (The Changeling, 4 cuts)', () => {
        const result = resolvePlaybackPlan(slotB)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.entries).toHaveLength(4)
        expect(result.entries.map((e) => e.source)).toEqual([
            'commentary',
            'movie',
            'commentary',
            'movie',
        ])
        expect(result.entries[0].startMs).toBe(0)
        expect(result.entries[0].endMs).toBe(120_000)
        expect(result.entries[3].endMs).toBe(6_420_000)
    })

    it('returns no_cuts error when cuts array is empty', () => {
        const slot: MovieSlot = { ...slotA, cuts: [] }
        const result = resolvePlaybackPlan(slot)
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('no_cuts')
    })

    it('returns missing_movie_file when a movie cut exists but movieMatch.path is absent', () => {
        const slot: MovieSlot = {
            ...slotA,
            movieMatch: { ...slotA.movieMatch, path: undefined },
        }
        const result = resolvePlaybackPlan(slot)
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('missing_movie_file')
    })

    it('returns missing_commentary_file when a commentary cut exists but commentaryMatch.path is absent', () => {
        const slot: MovieSlot = {
            ...slotA,
            commentaryMatch: { ...slotA.commentaryMatch, path: undefined },
        }
        const result = resolvePlaybackPlan(slot)
        expect(result.ok).toBe(false)
        if (result.ok) return
        expect(result.error.code).toBe('missing_commentary_file')
    })

    it('applies userOffsetMs to both effectiveStartMs and effectiveEndMs', () => {
        const slot: MovieSlot = {
            ...slotA,
            cuts: [
                {
                    id: 'test-c1',
                    sortOrder: 1,
                    sourceType: 'movie',
                    startMs: 1_000,
                    endMs: 5_000,
                    userOffsetMs: -500,
                },
            ],
        }
        const result = resolvePlaybackPlan(slot)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.entries[0].effectiveStartMs).toBe(500)
        expect(result.entries[0].effectiveEndMs).toBe(4_500)
    })

    it('clamps effectiveStartMs to 0 when offset pushes it negative', () => {
        const slot: MovieSlot = {
            ...slotA,
            cuts: [
                {
                    id: 'test-c1',
                    sortOrder: 1,
                    sourceType: 'movie',
                    startMs: 500,
                    endMs: 2_000,
                    userOffsetMs: -1_000,
                },
            ],
        }
        const result = resolvePlaybackPlan(slot)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.entries[0].effectiveStartMs).toBe(0)
    })

    it('passes through explicit endMs without transformation', () => {
        const slot: MovieSlot = {
            ...slotA,
            cuts: [
                {
                    id: 'test-c1',
                    sortOrder: 1,
                    sourceType: 'movie',
                    startMs: 0,
                    endMs: 3_000_000,
                    userOffsetMs: 0,
                },
            ],
        }
        const result = resolvePlaybackPlan(slot)
        expect(result.ok).toBe(true)
        if (!result.ok) return
        expect(result.entries[0].endMs).toBe(3_000_000)
        expect(result.entries[0].effectiveEndMs).toBe(3_000_000)
    })
})
