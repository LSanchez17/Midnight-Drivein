import Panel from '../../../components/ui/Panel'
import type { MovieSlot, SourceType } from '../types'
import FileMapping from './FileMapping'
import SlotTimeline from './SlotTimeline'
import OffsetControls from './OffsetControls'

interface SlotSectionProps {
    slot: MovieSlot
    offsets: Record<string, number>
    adjust: (cutId: string, delta: number) => void
    onResetCut: (cutId: string) => void
    onRemap: (fileType: SourceType) => void
}

export default function SlotSection({
    slot,
    offsets,
    adjust,
    onResetCut,
    onRemap,
}: SlotSectionProps) {
    const slotHeader = `Slot ${slot.slot.toUpperCase()}${slot.movieTitle
        ? ` — ${slot.movieTitle}${slot.movieYear ? ` (${slot.movieYear})` : ''}`
        : ''
        }`

    return (
        <Panel title={slotHeader}>
            <FileMapping
                matches={[slot.movieMatch, slot.commentaryMatch]}
                onRemap={onRemap}
            />
            {slot.cuts.length > 0 && <SlotTimeline cuts={slot.cuts} />}
            {slot.cuts.length > 0 && (
                <OffsetControls
                    cuts={slot.cuts}
                    offsets={offsets}
                    adjust={adjust}
                    onResetCut={onResetCut}
                />
            )}
        </Panel>
    )
}
