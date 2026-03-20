import { useState, useRef, useCallback, useEffect } from 'react'
import { convertFileSrc } from '@tauri-apps/api/core'
import { getPlaybackPlan } from '../../api'
import { resolveSeek } from './resolveSeek'
import type { PlaybackEntry, SourceType } from './types'
import { ApiError } from '../../api/errors'

export interface UsePlaybackOptions {
    onSlotEnd?: () => void
}

export interface UsePlaybackResult {
    movieVideoRef: React.RefObject<HTMLVideoElement | null>
    commentaryVideoRef: React.RefObject<HTMLVideoElement | null>
    activeSource: SourceType | null
    plan: PlaybackEntry[] | null
    loadingPlan: boolean
    playing: boolean
    globalTimeMs: number
    totalDurationMs: number
    activeEntryIndex: number
    error: string | null
    loadPlan: (episodeId: string, slot: string) => Promise<void>
    play: () => void
    pause: () => void
    seek: (globalMs: number) => void
}

export function usePlayback(options?: UsePlaybackOptions): UsePlaybackResult {
    const movieVideoRef = useRef<HTMLVideoElement>(null)
    const commentaryVideoRef = useRef<HTMLVideoElement>(null)

    const [plan, setPlan] = useState<PlaybackEntry[] | null>(null)
    const [activeEntryIndex, setActiveEntryIndex] = useState(0)
    const [playing, setPlaying] = useState(false)
    const [globalTimeMs, setGlobalTimeMs] = useState(0)
    const [totalDurationMs, setTotalDurationMs] = useState(0)
    const [loadingPlan, setLoadingPlan] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const [activeSource, setActiveSource] = useState<SourceType | null>(null)

    const planRef = useRef<PlaybackEntry[] | null>(null)
    const activeEntryIndexRef = useRef(0)
    const transitionInFlightRef = useRef(false)
    const optionsRef = useRef(options)
    optionsRef.current = options

    const getVideoEl = useCallback((source: SourceType): HTMLVideoElement | null => {
        return source === 'movie' ? movieVideoRef.current : commentaryVideoRef.current
    }, [])

    const handleTimeUpdate = useCallback(
        (source: SourceType) => {
            const entries = planRef.current
            if (!entries) return

            const currentIdx = activeEntryIndexRef.current
            const activeEntry = entries[currentIdx]
            if (!activeEntry || activeEntry.source !== source) return

            const activeEl = getVideoEl(source)
            if (!activeEl) return

            const currentFileMs = activeEl.currentTime * 1000
            const globalMs =
                activeEntry.globalStartMs + (currentFileMs - activeEntry.effectiveStartMs)

            setGlobalTimeMs(globalMs)

            if (transitionInFlightRef.current) return

            const nextEntry = entries[currentIdx + 1]
            if (nextEntry) {
                if (globalMs >= activeEntry.globalEndMs - 50) {
                    transitionInFlightRef.current = true
                    const inactiveEl = getVideoEl(nextEntry.source)
                    if (inactiveEl) {
                        inactiveEl.currentTime = nextEntry.effectiveStartMs / 1000
                        inactiveEl.play()
                    }
                    activeEl.pause()
                    activeEntryIndexRef.current = currentIdx + 1
                    setActiveEntryIndex(currentIdx + 1)
                    setActiveSource(nextEntry.source)
                    transitionInFlightRef.current = false
                }
            } else {
                if (globalMs >= activeEntry.globalEndMs - 50) {
                    activeEl.pause()
                    setPlaying(false)
                    optionsRef.current?.onSlotEnd?.()
                }
            }
        },
        [getVideoEl],
    )

    const handleEnded = useCallback(
        (source: SourceType) => {
            const entries = planRef.current
            if (!entries) return

            const currentIdx = activeEntryIndexRef.current
            const activeEntry = entries[currentIdx]
            if (!activeEntry || activeEntry.source !== source) return

            if (transitionInFlightRef.current) return

            const nextEntry = entries[currentIdx + 1]
            if (nextEntry) {
                transitionInFlightRef.current = true
                const inactiveEl = getVideoEl(nextEntry.source)
                if (inactiveEl) {
                    inactiveEl.currentTime = nextEntry.effectiveStartMs / 1000
                    inactiveEl.play()
                }
                activeEntryIndexRef.current = currentIdx + 1
                setActiveEntryIndex(currentIdx + 1)
                setActiveSource(nextEntry.source)
                transitionInFlightRef.current = false
            } else {
                setPlaying(false)
                optionsRef.current?.onSlotEnd?.()
            }
        },
        [getVideoEl],
    )

    useEffect(() => {
        const movieEl = movieVideoRef.current
        const commEl = commentaryVideoRef.current
        if (!movieEl || !commEl) return

        const onMovieTimeUpdate = () => handleTimeUpdate('movie')
        const onCommTimeUpdate = () => handleTimeUpdate('commentary')
        const onMovieEnded = () => handleEnded('movie')
        const onCommEnded = () => handleEnded('commentary')

        movieEl.addEventListener('timeupdate', onMovieTimeUpdate)
        commEl.addEventListener('timeupdate', onCommTimeUpdate)
        movieEl.addEventListener('ended', onMovieEnded)
        commEl.addEventListener('ended', onCommEnded)

        return () => {
            movieEl.removeEventListener('timeupdate', onMovieTimeUpdate)
            commEl.removeEventListener('timeupdate', onCommTimeUpdate)
            movieEl.removeEventListener('ended', onMovieEnded)
            commEl.removeEventListener('ended', onCommEnded)
        }
    }, [plan, handleTimeUpdate, handleEnded])

    const loadPlan = useCallback(async (episodeId: string, slot: string) => {
        setLoadingPlan(true)
        setError(null)
        setPlaying(false)
        setGlobalTimeMs(0)
        setActiveEntryIndex(0)
        setActiveSource(null)
        setPlan(null)
        planRef.current = null
        activeEntryIndexRef.current = 0
        transitionInFlightRef.current = false

        try {
            const entries = await getPlaybackPlan(episodeId, slot)

            planRef.current = entries
            setPlan(entries)
            setActiveSource(entries[0]?.source ?? null)
            setTotalDurationMs(entries[entries.length - 1]?.globalEndMs ?? 0)

            const movieEntry = entries.find((e) => e.source === 'movie')
            const commentaryEntry = entries.find((e) => e.source === 'commentary')

            if (movieVideoRef.current && movieEntry) {
                movieVideoRef.current.src = convertFileSrc(movieEntry.filePath)
                movieVideoRef.current.onloadedmetadata = () => {
                    if (movieVideoRef.current) {
                        movieVideoRef.current.currentTime = movieEntry.effectiveStartMs / 1000
                    }
                }
            }
            if (commentaryVideoRef.current && commentaryEntry) {
                commentaryVideoRef.current.src = convertFileSrc(commentaryEntry.filePath)
                commentaryVideoRef.current.onloadedmetadata = () => {
                    if (commentaryVideoRef.current) {
                        commentaryVideoRef.current.currentTime =
                            commentaryEntry.effectiveStartMs / 1000
                    }
                }
            }
        } catch (e) {
            const msg = e instanceof ApiError ? e.message : String(e)
            setError(msg)
        } finally {
            setLoadingPlan(false)
        }
    }, [])

    const play = useCallback(() => {
        const entries = planRef.current
        if (!entries) return
        const source = entries[activeEntryIndexRef.current]?.source
        if (!source) return
        getVideoEl(source)?.play()
        setPlaying(true)
    }, [getVideoEl])

    const pause = useCallback(() => {
        const entries = planRef.current
        if (!entries) return
        const source = entries[activeEntryIndexRef.current]?.source
        if (!source) return
        getVideoEl(source)?.pause()
        setPlaying(false)
    }, [getVideoEl])

    const seek = useCallback(
        (globalMs: number) => {
            const entries = planRef.current
            if (!entries) return

            const { entryIndex, fileSeekMs } = resolveSeek(entries, Math.max(0, globalMs))
            const targetEntry = entries[entryIndex]

            if (entryIndex !== activeEntryIndexRef.current) {
                activeEntryIndexRef.current = entryIndex
                setActiveEntryIndex(entryIndex)
                setActiveSource(targetEntry.source)
            }

            const el = getVideoEl(targetEntry.source)
            if (el) el.currentTime = fileSeekMs / 1000

            const nextEntry = entries[entryIndex + 1]
            if (nextEntry) {
                const inactiveSource: SourceType =
                    targetEntry.source === 'movie' ? 'commentary' : 'movie'
                const inactiveEl = getVideoEl(inactiveSource)
                if (inactiveEl) {
                    inactiveEl.currentTime = nextEntry.effectiveStartMs / 1000
                }
            }
        },
        [getVideoEl],
    )

    return {
        movieVideoRef,
        commentaryVideoRef,
        activeSource,
        plan,
        loadingPlan,
        playing,
        globalTimeMs,
        totalDurationMs,
        activeEntryIndex,
        error,
        loadPlan,
        play,
        pause,
        seek,
    }
}
