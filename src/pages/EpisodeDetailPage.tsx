import { useEffect, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getEpisodeById } from '../api'
import type { Episode, SourceType } from '../features/episodes/types'
import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import StatusPill from '../components/ui/StatusPill'
import SlotSection from '../features/episodes/components/SlotSection'
import RemapDialog from '../features/episodes/components/RemapDialog'

type RemapTarget = { slotId: string; fileType: SourceType }

export default function EpisodeDetailPage() {
    const { episodeId } = useParams<{ episodeId: string }>()
    const navigate = useNavigate()
    const [episode, setEpisode] = useState<Episode | null>(null)
    const [offsets, setOffsets] = useState<Record<string, number>>({})
    const [remapTarget, setRemapTarget] = useState<RemapTarget | null>(null)
    const [notFound, setNotFound] = useState(false)

    useEffect(() => {
        if (!episodeId) return

        getEpisodeById(episodeId).then((ep) => {
            if (ep) {
                setEpisode(ep)
                setOffsets(
                    ep.slots.flatMap((s) => s.cuts).reduce<Record<string, number>>(
                        (acc, c) => ({ ...acc, [c.id]: c.userOffsetMs }),
                        {},
                    ),
                )
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

    const adjust = (cutId: string, delta: number) =>
        setOffsets((o) => ({ ...o, [cutId]: (o[cutId] ?? 0) + delta }))

    const episodeLabel = episode.isSpecial
        ? '★ Special'
        : `Season ${episode.season} · Episode ${episode.episode}`

    const firstSlot = episode.slots[0]

    const handleConfirmedRemap = () => {
        if (episodeId) {
            getEpisodeById(episodeId).then((ep) => {
                if (ep) setEpisode(ep)
            })
        }
    }

    return (
        <div className="space-y-5 max-w-3xl">
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
            {episode.slots.map((slot) => (
                <SlotSection
                    key={slot.id}
                    slot={slot}
                    offsets={offsets}
                    adjust={adjust}
                    onResetCut={(cutId) => setOffsets((o) => ({ ...o, [cutId]: 0 }))}
                    onRemap={(fileType) => setRemapTarget({ slotId: slot.id, fileType })}
                />
            ))}
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
                        ▶{' '}
                        {firstSlot?.movieTitle ??
                            firstSlot?.movieMatch.displayName ??
                            firstSlot?.movieMatch.filename ??
                            'Unknown Film'}
                    </p>
                    <div className="flex gap-3">
                        <Button variant="ghost">⏮</Button>
                        <Button variant="primary">▶ Play</Button>
                        <Button variant="ghost">⏭</Button>
                    </div>
                    {/* TODO: Remove Mock progress bar */}
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
            <div className="flex gap-3 flex-wrap">
                <Button variant="primary">▶ Play Episode</Button>
                <Button variant="ghost">Save Offsets</Button>
                <Button
                    variant="danger"
                    onClick={() =>
                        episode &&
                        setOffsets(
                            episode.slots.flatMap((s) => s.cuts).reduce<Record<string, number>>(
                                (acc, c) => ({ ...acc, [c.id]: 0 }),
                                {},
                            ),
                        )
                    }
                >
                    Reset
                </Button>
            </div>
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
                        <RemapDialog
                            slotId={remapTarget.slotId}
                            fileType={remapTarget.fileType}
                            folderRoot={remapTarget.fileType === 'movie' ? 'movies' : 'segments'}
                            onClose={() => setRemapTarget(null)}
                            onConfirmed={handleConfirmedRemap}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
