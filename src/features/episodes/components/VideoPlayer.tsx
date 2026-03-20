import { useEffect, useState } from 'react'
import type { Episode } from '../types'
import { usePlayback } from '../usePlayback'
import { useSettings } from '../../../context/SettingsContext'
import { msToHMS } from '../../../utils/time'
import { ACCENT_CREAM, ACCENT_DARK, ACCENT_PINK, ACCENT_RED, MUTED_TEXT } from '../../../utils/colorConstants'
import LoadingSkeleton from '../../../components/ui/Loading'

interface VideoPlayerProps {
    episode: Episode
}

export default function VideoPlayer({ episode }: VideoPlayerProps) {
    const { settings } = useSettings()
    const autoAdvanceSlots = settings?.autoAdvanceSlots ?? true

    const [activeSlot, setActiveSlot] = useState<string>(episode.slots[0]?.slot ?? '')

    const {
        movieVideoRef,
        commentaryVideoRef,
        activeSource,
        loadingPlan,
        playing,
        globalTimeMs,
        totalDurationMs,
        error,
        loadPlan,
        play,
        pause,
        seek,
    } = usePlayback({
        onSlotEnd: () => {
            const currentIndex = episode.slots.findIndex((s) => s.slot === activeSlot)
            if (autoAdvanceSlots && currentIndex < episode.slots.length - 1) {
                const nextSlot = episode.slots[currentIndex + 1]
                setActiveSlot(nextSlot.slot)
                loadPlan(episode.id, nextSlot.slot)
            }
        },
    })

    useEffect(() => {
        if (episode.slots.length > 0) {
            loadPlan(episode.id, episode.slots[0].slot)
        }
    }, [episode.id]) // eslint-disable-line react-hooks/exhaustive-deps

    function handleSlotClick(slotLetter: string) {
        setActiveSlot(slotLetter)
        loadPlan(episode.id, slotLetter)
    }

    function handleScrubberClick(e: React.MouseEvent<HTMLDivElement>) {
        if (!totalDurationMs) return
        const rect = e.currentTarget.getBoundingClientRect()
        const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
        seek(fraction * totalDurationMs)
    }

    const progressPercent = totalDurationMs > 0 ? (globalTimeMs / totalDurationMs) * 100 : 0
    const currentSlot = episode.slots.find((s) => s.slot === activeSlot)

    return (
        <div className="space-y-3">
            {episode.slots.length > 1 && (
                <div className="flex gap-2 flex-wrap">
                    {episode.slots.map((s) => {
                        const label =
                            s.movieTitle ??
                            s.commentaryMatch.displayName ??
                            s.commentaryMatch.filename ??
                            s.slot.toUpperCase()
                        const isActive = s.slot === activeSlot
                        return (
                            <button
                                key={s.slot}
                                onClick={() => handleSlotClick(s.slot)}
                                className="px-3 py-1 rounded text-xs uppercase tracking-wider transition-colors cursor-pointer"
                                style={{
                                    backgroundColor: isActive ? ACCENT_RED : '#1e1e24',
                                    color: isActive ? ACCENT_CREAM : MUTED_TEXT,
                                    border: `1px solid ${ACCENT_DARK}`,
                                }}
                            >
                                {label}
                            </button>
                        )
                    })}
                </div>
            )}
            <div className="relative w-full rounded overflow-hidden" style={{ backgroundColor: '#000' }}>
                <video
                    ref={movieVideoRef}
                    style={{ display: activeSource === 'movie' ? 'block' : 'none', width: '100%' }}
                    playsInline
                />
                <video
                    ref={commentaryVideoRef}
                    style={{ display: activeSource === 'commentary' ? 'block' : 'none', width: '100%' }}
                    playsInline
                />
                {activeSource === null && !loadingPlan && (
                    <div
                        className="flex items-center justify-center"
                        style={{ height: 160, color: MUTED_TEXT }}
                    >
                        {currentSlot?.movieTitle ?? 'No video loaded'}
                    </div>
                )}
                {loadingPlan && (
                    <LoadingSkeleton simple />
                )}
            </div>
            {error && (
                <p className="text-sm px-3 py-2 rounded" style={{ color: ACCENT_PINK, backgroundColor: '#1e0a0a', border: '1px solid #3d1515' }}>
                    ⚠ {error} · Check Library Settings
                </p>
            )}
            <div
                className="w-full rounded-full h-2 cursor-pointer overflow-hidden"
                style={{ backgroundColor: ACCENT_DARK }}
                onClick={handleScrubberClick}
            >
                <div
                    className="h-2 rounded-full transition-all"
                    style={{ backgroundColor: ACCENT_RED, width: `${progressPercent}%` }}
                />
            </div>
            <div className="flex items-center justify-between text-xs" style={{ color: MUTED_TEXT }}>
                <span>{msToHMS(globalTimeMs)} / {msToHMS(totalDurationMs)}</span>
                {activeSource && (
                    <span
                        className="uppercase tracking-widest px-2 py-0.5 rounded"
                        style={{ backgroundColor: '#1e1e24', color: MUTED_TEXT, fontSize: 9 }}
                    >
                        {activeSource}
                    </span>
                )}
            </div>
            <div className="flex gap-3 justify-center">
                <button
                    onClick={() => seek(0)}
                    disabled={!totalDurationMs}
                    className="px-3 py-1.5 rounded text-sm cursor-pointer disabled:opacity-40 transition-colors"
                    style={{ backgroundColor: '#1e1e24', color: ACCENT_CREAM, border: `1px solid ${ACCENT_DARK}` }}
                    aria-label="Restart"
                >
                    ⏮
                </button>
                <button
                    onClick={playing ? pause : play}
                    disabled={!totalDurationMs || loadingPlan}
                    className="px-5 py-1.5 rounded text-sm font-medium cursor-pointer disabled:opacity-40 transition-colors"
                    style={{ backgroundColor: ACCENT_RED, color: ACCENT_CREAM }}
                    aria-label={playing ? 'Pause' : 'Play'}
                >
                    {playing ? '⏸' : '▶'}
                </button>
                {episode.slots.length > 1 && (
                    <button
                        onClick={() => {
                            const nextIndex = episode.slots.findIndex((s) => s.slot === activeSlot) + 1
                            if (nextIndex < episode.slots.length) {
                                handleSlotClick(episode.slots[nextIndex].slot)
                            }
                        }}
                        disabled={episode.slots.findIndex((s) => s.slot === activeSlot) >= episode.slots.length - 1}
                        className="px-3 py-1.5 rounded text-sm cursor-pointer disabled:opacity-40 transition-colors"
                        style={{ backgroundColor: '#1e1e24', color: ACCENT_CREAM, border: `1px solid ${ACCENT_DARK}` }}
                        aria-label="Next slot"
                    >
                        ⏭
                    </button>
                )}
            </div>
        </div>
    )
}
