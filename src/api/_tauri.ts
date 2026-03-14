import { invoke } from '@tauri-apps/api/core'
import { deriveEpisodeStatus } from '../lib/derive/episodeStatus'
import type { Episode, FileMatch, PlaybackCut, SourceType, MatchStatus } from '../features/episodes/types'
import type { AppSettings, AppSettingsPatch, EpisodeFilters } from './types'
import { ApiError, type ErrorCode } from './errors'

// Error parsing — Rust errors use "ERROR_CODE: message" prefix convention
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

// Wire types — JSON shape as sent by Rust (null for missing Option<T> values)
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

interface EpisodeRowWire {
    id: string
    title: string
    season: number | null
    episode: number | null
    isSpecial: boolean
    airDate: string | null
    description: string | null
    movieMatch: FileMatchWire
    segmentMatch: FileMatchWire
    cuts: PlaybackCutWire[]
    flaggedForTiming: boolean
}

// Domain type conversions
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

function toCut(w: PlaybackCutWire): PlaybackCut {
    return {
        id: w.id,
        sortOrder: w.sortOrder,
        sourceType: w.sourceType,
        startMs: w.startMs,
        endMs: w.endMs,
        userOffsetMs: w.userOffsetMs,
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
        movieMatch: toFileMatch(row.movieMatch),
        segmentMatch: toFileMatch(row.segmentMatch),
        cuts: row.cuts.map(toCut),
        flaggedForTiming: row.flaggedForTiming,
        status: 'Ready' as const,
    }
    return { ...partial, status: deriveEpisodeStatus(partial) }
}

// Exported API — matches the shape of _mock.ts at all times
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

export async function scanLibrary(): Promise<void> {
    try {
        await invoke<void>('scan_library')
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
    episodeId: string,
    flaggedForTiming: boolean,
): Promise<void> {
    try {
        await invoke<void>('save_playback_override', { episodeId, flaggedForTiming })
    } catch (e) {
        throw parseError(e)
    }
}

export async function remapFile(
    episodeId: string,
    fileType: SourceType,
    mediaFileId: string,
): Promise<void> {
    try {
        await invoke<void>('remap_file', { episodeId, fileType, mediaFileId })
    } catch (e) {
        throw parseError(e)
    }
}
