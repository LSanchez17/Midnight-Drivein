import type { MovieSlot, PlaybackEntry, PlaybackPlanResult } from './types'

export function resolvePlaybackPlan(slot: MovieSlot): PlaybackPlanResult {
    if (slot.cuts.length === 0) {
        return { ok: false, error: { code: 'no_cuts' } }
    }

    const needsMovie = slot.cuts.some((c) => c.sourceType === 'movie')
    const needsCommentary = slot.cuts.some((c) => c.sourceType === 'commentary')

    if (needsMovie && !slot.movieMatch.path) {
        return { ok: false, error: { code: 'missing_movie_file' } }
    }

    if (needsCommentary && !slot.commentaryMatch.path) {
        return { ok: false, error: { code: 'missing_commentary_file' } }
    }

    const entries: PlaybackEntry[] = []
    let cursor = 0

    for (const cut of slot.cuts) {
        const filePath =
            cut.sourceType === 'movie'
                ? slot.movieMatch.path!
                : slot.commentaryMatch.path!

        const effectiveStartMs = Math.max(0, cut.startMs + cut.userOffsetMs)
        const effectiveEndMs = Math.max(effectiveStartMs, cut.endMs + cut.userOffsetMs)
        const duration = effectiveEndMs - effectiveStartMs

        const globalStartMs = cursor
        const globalEndMs = cursor + duration
        cursor = globalEndMs

        entries.push({
            order: cut.sortOrder,
            source: cut.sourceType,
            filePath,
            startMs: cut.startMs,
            endMs: cut.endMs,
            effectiveStartMs,
            effectiveEndMs,
            cutId: cut.id,
            globalStartMs,
            globalEndMs,
        })
    }

    return { ok: true, entries }
}
