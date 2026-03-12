import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEpisodeById } from '../api'
import type { Episode, SlotKey } from '../features/episodes/types'
import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import StatusPill from '../components/ui/StatusPill'

const SLOT_LABEL: Record<SlotKey, string> = {
    movie1: 'Movie 1',
    segment1: 'Segment 1',
    movie2: 'Movie 2',
    segment2: 'Segment 2',
}

export default function EpisodeDetailPage() {
    const { episodeId } = useParams<{ episodeId: string }>()
    const navigate = useNavigate()
    const [episode, setEpisode] = useState<Episode | null>(null)
    const [offsets, setOffsets] = useState({ segment1: 0, segment2: 0 })
    const [remapTarget, setRemapTarget] = useState<SlotKey | null>(null)
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        if (!episodeId) return
        getEpisodeById(episodeId).then((ep) => {
            if (ep) {
                setEpisode(ep)
                setOffsets(ep.playbackConfig.offsets)
            } else {
                setNotFound(true)
            }
        })
    }, [episodeId])

    if (notFound) {
        return (
            <div className="flex flex-col items-center justify-center py-24 gap-3">
                <span className="text-5xl">💀</span>
                <p style={{ color: '#b8b1a1' }}>Episode not found.</p>
                <Button variant="ghost" onClick={() => navigate('/library')}>
                    ← Back to Library
                </Button>
            </div>
        )
    }

    if (!episode) {
        return (
            <div className="space-y-4 max-w-3xl animate-pulse">
                {[...Array(4)].map((_, i) => (
                    <div
                        key={i}
                        className="rounded-lg h-24"
                        style={{ backgroundColor: '#15151b', border: '1px solid #2a2a33' }}
                    />
                ))}
            </div>
        )
    }

    const adjust = (key: 'segment1' | 'segment2', delta: number) =>
        setOffsets((o) => ({ ...o, [key]: o[key] + delta }))

    const episodeLabel = episode.isSpecial
        ? '★ Special'
        : `Season ${episode.season} · Episode ${episode.episode}`

    return (
        <div className="space-y-5 max-w-3xl">
            {/* Header */}
            <div>
                <button
                    className="text-xs mb-3 block transition-colors cursor-pointer"
                    style={{ color: '#b8b1a1' }}
                    onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = '#f3ebd2')}
                    onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = '#b8b1a1')}
                    onClick={() => navigate('/library')}
                >
                    ← Back to Library
                </button>
                <div className="flex items-start justify-between gap-4">
                    <div>
                        <p
                            className="text-[10px] uppercase tracking-[0.2em] mb-1"
                            style={{ color: '#b8b1a1' }}
                        >
                            {episodeLabel}
                            {episode.airDate && ` · ${episode.airDate}`}
                        </p>
                        <h1
                            className="text-3xl uppercase tracking-[0.1em] leading-tight"
                            style={{
                                color: '#f3ebd2',
                                fontFamily: 'Impact, "Arial Narrow", sans-serif',
                            }}
                        >
                            {episode.title}
                        </h1>
                        <p className="text-sm mt-2" style={{ color: '#b8b1a1' }}>
                            {episode.description}
                        </p>
                    </div>
                    <StatusPill status={episode.status} className="mt-1 shrink-0" />
                </div>
            </div>

            {/* Metadata */}
            <Panel title="Metadata">
                <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
                    <dt style={{ color: '#b8b1a1' }}>Type</dt>
                    <dd style={{ color: '#f3ebd2' }}>{episode.isSpecial ? 'Special' : 'Episode'}</dd>
                    {!episode.isSpecial && (
                        <>
                            <dt style={{ color: '#b8b1a1' }}>Season / Episode</dt>
                            <dd style={{ color: '#f3ebd2' }}>
                                S{episode.season} E{episode.episode}
                            </dd>
                        </>
                    )}
                    <dt style={{ color: '#b8b1a1' }}>Air Date</dt>
                    <dd style={{ color: '#f3ebd2' }}>{episode.airDate ?? '—'}</dd>
                    <dt style={{ color: '#b8b1a1' }}>Status</dt>
                    <dd>
                        <StatusPill status={episode.status} />
                    </dd>
                </dl>
            </Panel>

            {/* File Mapping */}
            <Panel title="File Mapping">
                <div className="space-y-3">
                    {episode.fileMatches.map((match) => {
                        const slotIndex = match.slot.startsWith('movie')
                            ? parseInt(match.slot.replace('movie', '')) - 1
                            : parseInt(match.slot.replace('segment', '')) - 1
                        const contextTitle = match.slot.startsWith('movie')
                            ? episode.movies[slotIndex]?.title
                            : episode.segments[slotIndex]?.title

                        return (
                            <div
                                key={match.slot}
                                className="flex items-center justify-between gap-4 text-sm pb-3 last:pb-0"
                                style={{ borderBottom: '1px solid #2a2a33' }}
                            >
                                <div className="min-w-0">
                                    <p
                                        className="text-[10px] uppercase tracking-[0.15em] mb-0.5"
                                        style={{ color: '#b8b1a1' }}
                                    >
                                        {SLOT_LABEL[match.slot]} — {contextTitle}
                                    </p>
                                    <p
                                        className="truncate"
                                        style={{
                                            color: match.status === 'missing' ? '#f87171' : '#f3ebd2',
                                        }}
                                    >
                                        {match.filename ?? 'No file matched'}
                                    </p>
                                    {match.confidence !== undefined && (
                                        <p className="text-[10px] mt-0.5" style={{ color: '#b8b1a1' }}>
                                            Confidence: {Math.round(match.confidence * 100)}%
                                            {match.status === 'low-confidence' && (
                                                <span style={{ color: '#fdba74' }}> · Low confidence</span>
                                            )}
                                        </p>
                                    )}
                                </div>
                                <Button
                                    variant="ghost"
                                    className="text-xs px-3 py-1 shrink-0"
                                    onClick={() => setRemapTarget(match.slot)}
                                >
                                    Remap
                                </Button>
                            </div>
                        )
                    })}
                </div>
            </Panel>

            {/* Fake Player */}
            <Panel title="Playback">
                <div
                    className="rounded-lg p-6 flex flex-col items-center gap-4"
                    style={{ backgroundColor: '#0b0b0f', border: '1px solid #2a2a33' }}
                >
                    <p
                        className="text-[10px] uppercase tracking-[0.25em]"
                        style={{ color: '#b8b1a1' }}
                    >
                        Player Shell — Mocked
                    </p>
                    <p
                        className="text-xl uppercase tracking-[0.1em]"
                        style={{
                            color: '#f3ebd2',
                            fontFamily: 'Impact, "Arial Narrow", sans-serif',
                        }}
                    >
                        {episode.title}
                    </p>
                    <p className="text-sm" style={{ color: '#b8b1a1' }}>
                        ▶ {episode.movies[0].title}
                    </p>
                    <div className="flex gap-3">
                        <Button variant="ghost">⏮</Button>
                        <Button variant="primary">▶ Play</Button>
                        <Button variant="ghost">⏭</Button>
                    </div>
                    {/* Mock progress bar */}
                    <div
                        className="w-full rounded-full h-1.5 mt-1 overflow-hidden"
                        style={{ backgroundColor: '#2a2a33' }}
                    >
                        <div
                            className="h-1.5 rounded-full"
                            style={{ backgroundColor: '#8b1e2d', width: '33%' }}
                        />
                    </div>
                    <p className="text-[10px]" style={{ color: '#2a2a33' }}>
                        00:42:17 / 02:04:00
                    </p>
                </div>
            </Panel>

            {/* Timeline */}
            <Panel title="Timeline">
                <div className="space-y-2">
                    <div className="flex gap-1 h-8 rounded overflow-hidden">
                        {(['Segment 1', 'Movie 1', 'Segment 2', 'Movie 2'] as const).map((label, i) => (
                            <div
                                key={i}
                                className="flex-1 flex items-center justify-center text-[9px] uppercase tracking-widest"
                                style={{
                                    backgroundColor: i % 2 === 0 ? 'rgba(139,30,45,0.25)' : '#2a2a33',
                                    color: i % 2 === 0 ? '#f3ebd2' : '#b8b1a1',
                                    border: i % 2 === 0 ? '1px solid #8b1e2d' : '1px solid #2a2a33',
                                }}
                            >
                                {label}
                            </div>
                        ))}
                    </div>
                    <p className="text-[10px]" style={{ color: '#2a2a33' }}>
                        Playback order: segment → movie → segment → movie
                    </p>
                </div>
            </Panel>

            {/* Offset Controls */}
            <Panel title="Offset Adjustment">
                <div className="space-y-4 text-sm">
                    {(['segment1', 'segment2'] as const).map((key) => (
                        <div key={key} className="flex items-center justify-between gap-4">
                            <span style={{ color: '#b8b1a1' }}>
                                {key === 'segment1' ? 'Segment 1' : 'Segment 2'}
                            </span>
                            <div className="flex items-center gap-2">
                                {[-10, -5].map((d) => (
                                    <Button
                                        key={d}
                                        variant="ghost"
                                        className="px-2 py-1 text-xs"
                                        onClick={() => adjust(key, d)}
                                    >
                                        {d}s
                                    </Button>
                                ))}
                                <span
                                    className="w-16 text-center text-xs px-2 py-1 rounded"
                                    style={{
                                        color: offsets[key] !== 0 ? '#fdba74' : '#f3ebd2',
                                        backgroundColor: '#0b0b0f',
                                        border: '1px solid #2a2a33',
                                    }}
                                >
                                    {offsets[key] >= 0 ? '+' : ''}
                                    {offsets[key]}s
                                </span>
                                {[5, 10].map((d) => (
                                    <Button
                                        key={d}
                                        variant="ghost"
                                        className="px-2 py-1 text-xs"
                                        onClick={() => adjust(key, d)}
                                    >
                                        +{d}s
                                    </Button>
                                ))}
                                {offsets[key] !== 0 && (
                                    <button
                                        className="text-[10px] underline"
                                        style={{ color: '#b8b1a1' }}
                                        onClick={() => setOffsets((o) => ({ ...o, [key]: 0 }))}
                                    >
                                        reset
                                    </button>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </Panel>

            {/* Action Row */}
            <div className="flex gap-3 flex-wrap">
                <Button variant="primary">▶ Play Episode</Button>
                <Button variant="ghost">Save Offsets</Button>
                <Button
                    variant="danger"
                    onClick={() => episode && setOffsets(episode.playbackConfig.offsets)}
                >
                    Reset
                </Button>
            </div>

            {/* Remap Drawer / Modal */}
            {remapTarget && (
                <div
                    className="fixed inset-0 flex items-center justify-center z-50 p-6"
                    style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
                    onClick={(e) => e.target === e.currentTarget && setRemapTarget(null)}
                >
                    <div
                        className="w-full max-w-lg rounded-lg p-6 space-y-4"
                        style={{
                            backgroundColor: '#15151b',
                            border: '1px solid #2a2a33',
                        }}
                    >
                        <h2
                            className="text-xl uppercase tracking-[0.15em]"
                            style={{
                                color: '#f3ebd2',
                                fontFamily: 'Impact, "Arial Narrow", sans-serif',
                            }}
                        >
                            Remap — {SLOT_LABEL[remapTarget]}
                        </h2>
                        <p className="text-sm" style={{ color: '#b8b1a1' }}>
                            Select a replacement file for this slot. File picker will be connected in a later
                            phase.
                        </p>
                        <div
                            className="rounded px-3 py-2 text-sm"
                            style={{
                                backgroundColor: '#0b0b0f',
                                border: '1px solid #2a2a33',
                                color: '#b8b1a1',
                            }}
                        >
                            /media/…/filename.mkv
                        </div>
                        <div className="flex gap-3 justify-end">
                            <Button variant="ghost" onClick={() => setRemapTarget(null)}>
                                Cancel
                            </Button>
                            <Button
                                variant="primary"
                                onClick={() => setRemapTarget(null)}
                            >
                                Confirm Remap
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}
