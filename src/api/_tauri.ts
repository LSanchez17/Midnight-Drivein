import { invoke } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import { deriveEpisodeStatus } from '../utils/EpisodeStatuses'
import type { Episode, MovieSlot, FileMatch, PlaybackCut, SourceType, MatchStatus, PlaybackEntry } from '../features/episodes/types'
import type { AppSettings, AppSettingsPatch, EpisodeFilters, ScanResult, MediaFileSummary, PlaybackEntry as PlaybackEntryWire } from './types'
import { ApiError, type ErrorCode } from './errors'

function parseError(raw: unknown): ApiError {
    const msg = String(raw)
    const match = msg.match(
        /^(NOT_FOUND|INVALID_INPUT|IO_ERROR|DB_ERROR|SCAN_IN_PROGRESS):/,
    )
    if (match) {
        return new ApiError(match[1] as ErrorCode, msg.slice(match[1].length + 1).trim())
    }
    return new ApiError('UNKNOWN', msg)
}

interface FileMatchWire {
    fileType: SourceType
    filename: string | null
    displayName: string | null
    path: string | null
    confidence: number | null
    status: MatchStatus
    isUserOverridden: boolean
    matchedAt: string | null
}

interface PlaybackCutWire {
    id: string
    sortOrder: number
    sourceType: SourceType
    startMs: number
    endMs: number
    userOffsetMs: number
}

interface MovieSlotWire {
    id: string
    slot: string
    commentary: string | null
    movieTitle: string | null
    movieYear: number | null
    movieMatch: FileMatchWire
    commentaryMatch: FileMatchWire
    cuts: PlaybackCutWire[]
    flaggedForTiming: boolean
}

interface EpisodeRowWire {
    id: string
    title: string
    season: number | null
    episode: number | null
    isSpecial: boolean
    airDate: string | null
    description: string | null
    guests: string[] | null
    slots: MovieSlotWire[]
}

function toFileMatch(w: FileMatchWire): FileMatch {
    return {
        fileType: w.fileType,
        filename: w.filename ?? undefined,
        displayName: w.displayName ?? undefined,
        path: w.path ?? undefined,
        confidence: w.confidence ?? undefined,
        status: w.status,
        isUserOverridden: w.isUserOverridden,
        matchedAt: w.matchedAt ?? undefined,
    }
}

function toCut(wire: PlaybackCutWire): PlaybackCut {
    return {
        id: wire.id,
        sortOrder: wire.sortOrder,
        sourceType: wire.sourceType,
        startMs: wire.startMs,
        endMs: wire.endMs,
        userOffsetMs: wire.userOffsetMs,
    }
}

function toSlot(wire: MovieSlotWire): MovieSlot {
    return {
        id: wire.id,
        slot: wire.slot,
        commentary: wire.commentary ?? undefined,
        movieTitle: wire.movieTitle ?? undefined,
        movieYear: wire.movieYear ?? undefined,
        movieMatch: toFileMatch(wire.movieMatch),
        commentaryMatch: toFileMatch(wire.commentaryMatch),
        cuts: wire.cuts.map(toCut),
        flaggedForTiming: wire.flaggedForTiming,
    }
}

function toEpisode(row: EpisodeRowWire): Episode {
    const partial = {
        id: row.id,
        title: row.title,
        season: row.season ?? undefined,
        episode: row.episode ?? undefined,
        isSpecial: row.isSpecial,
        airDate: row.airDate ?? undefined,
        description: row.description ?? undefined,
        guests: row.guests ?? [],
        slots: row.slots.map(toSlot),
        status: 'Ready' as const,
    }
    return { ...partial, status: deriveEpisodeStatus(partial) }
}

export async function getSettings(): Promise<AppSettings> {
    try {
        return await invoke<AppSettings>('get_settings')
    } catch (e) {
        throw parseError(e)
    }
}

export async function saveSettings(patch: AppSettingsPatch): Promise<void> {
    try {
        await invoke<void>('save_settings', { settings: patch })
    } catch (e) {
        throw parseError(e)
    }
}

export async function getEpisodes(filters?: EpisodeFilters): Promise<Episode[]> {
    try {
        const rows = await invoke<EpisodeRowWire[]>('get_episodes', { filters })
        return rows.map(toEpisode)
    } catch (e) {
        throw parseError(e)
    }
}

export async function getEpisodeById(id: string): Promise<Episode | undefined> {
    try {
        const row = await invoke<EpisodeRowWire | null>('get_episode_by_id', { id })
        return row !== null ? toEpisode(row) : undefined
    } catch (e) {
        throw parseError(e)
    }
}

export async function scanLibrary(): Promise<ScanResult> {
    try {
        return await invoke<ScanResult>('scan_library')
    } catch (e) {
        throw parseError(e)
    }
}

export async function getScanSummary(): Promise<ScanResult | null> {
    try {
        const result = await invoke<ScanResult | null>('get_scan_summary')
        return result ?? null
    } catch (e) {
        throw parseError(e)
    }
}

export async function saveCutOffset(cutId: string, offsetMs: number): Promise<void> {
    try {
        await invoke<void>('save_cut_offset', { cutId, offsetMs })
    } catch (e) {
        throw parseError(e)
    }
}

export async function savePlaybackOverride(
    slotId: string,
    flaggedForTiming: boolean,
): Promise<void> {
    try {
        await invoke<void>('save_playback_override', { slotId, flaggedForTiming })
    } catch (e) {
        throw parseError(e)
    }
}

export async function remapFile(
    slotId: string,
    fileType: SourceType,
    mediaFileId: string,
): Promise<void> {
    try {
        await invoke<void>('remap_file', { slotId, fileType, mediaFileId })
    } catch (e) {
        throw parseError(e)
    }
}

export async function listMediaFiles(
    folderRoot: 'movies' | 'commentary',
): Promise<MediaFileSummary[]> {
    try {
        const rows = await invoke<MediaFileSummary[]>('list_media_files', { folderRoot })

        return rows.map((r) => ({
            ...r,
            displayName: r.displayName ?? undefined,
            sizeBytes: r.sizeBytes ?? undefined,
        }))
    } catch (e) {
        throw parseError(e)
    }
}

export async function getPlaybackPlan(
    episodeId: string,
    slot: string,
): Promise<PlaybackEntry[]> {
    try {
        const rows = await invoke<PlaybackEntryWire[]>('get_playback_plan', { episodeId, slot })
        return rows.map(row => ({
            order: row.order,
            source: row.source,
            filePath: row.filePath,
            startMs: row.startMs,
            endMs: row.endMs,
            effectiveStartMs: row.effectiveStartMs,
            effectiveEndMs: row.effectiveEndMs,
            cutId: row.cutId,
            globalStartMs: row.globalStartMs,
            globalEndMs: row.globalEndMs,
        }))
    } catch (e) {
        throw parseError(e)
    }
}

export async function selectLibraryRoot(): Promise<string | null> {
    try {
        const selected = await open({ directory: true, multiple: false })
        if (selected === null || selected === undefined) return null
        return selected as string
    } catch (e) {
        throw parseError(e)
    }
}
