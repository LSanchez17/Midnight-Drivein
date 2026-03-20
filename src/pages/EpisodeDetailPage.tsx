import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { getEpisodeById } from '../api'
import type { Episode, SourceType } from '../features/episodes/types'
import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import SlotSection from '../features/episodes/components/SlotSection'
import RemapDialog from '../features/episodes/components/RemapDialog'
import VideoPlayer from '../features/episodes/components/VideoPlayer'
import EpisodeMetaData from '../features/episodes/components/EpisodeMetaData'
import EpisodeHeader from '../features/episodes/components/EpisodeHeader'
import GoBack from '../components/ui/GoBack'
import { ACCENT_DARK, MUTED_TEXT, SECONDARY_BACKGROUND } from '../utils/colorConstants'
import LoadingSkeleton from '../components/ui/Loading'

type RemapTarget = { slotId: string; fileType: SourceType }

export default function EpisodeDetailPage() {
    const { episodeId } = useParams<{ episodeId: string }>()
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
                <p style={{ color: MUTED_TEXT }}>Episode not found.</p>
                <GoBack url="/library" location="Library" />
            </div>
        )
    }

    if (!episode) {
        return (
            <LoadingSkeleton itemCount={4} className="space-y-4 max-w-3xl animate-pulse" />
        )
    }

    const adjust = (cutId: string, delta: number) =>
        setOffsets((o) => ({ ...o, [cutId]: (o[cutId] ?? 0) + delta }))

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
                <GoBack url="/library" location="Library" />
                <EpisodeHeader episode={episode} />
            </div>
            <Panel title="Metadata">
                <EpisodeMetaData episode={episode} />
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
                <VideoPlayer episode={episode} />
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
                            backgroundColor: SECONDARY_BACKGROUND,
                            border: `1px solid ${ACCENT_DARK}`,
                        }}
                    >
                        <RemapDialog
                            slotId={remapTarget.slotId}
                            fileType={remapTarget.fileType}
                            folderRoot={remapTarget.fileType === 'movie' ? 'movies' : 'commentary'}
                            onClose={() => setRemapTarget(null)}
                            onConfirmed={handleConfirmedRemap}
                        />
                    </div>
                </div>
            )}
        </div>
    )
}
