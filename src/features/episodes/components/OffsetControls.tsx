import Button from '../../../components/ui/Button'
import { ACCENT_CREAM, ACCENT_DARK, ACCENT_ORANGE, MUTED_TEXT, PRIMARY_BACKGROUND } from '../../../utils/colorConstants'
import { msToHMS } from '../../../utils/time'
import type { PlaybackCut } from '../types'

interface OffsetControlsProps {
    cuts: PlaybackCut[]
    offsets: Record<string, number>
    adjust: (cutId: string, delta: number) => void
    onResetCut: (cutId: string) => void
}

export default function OffsetControls({
    cuts,
    offsets,
    adjust,
    onResetCut,
}: OffsetControlsProps) {
    return (
        <div className="space-y-4 text-sm">
            <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: MUTED_TEXT }}>
                Offset Adjustment
            </p>
            {cuts.map((cut) => (
                <div key={cut.id} className="flex items-center justify-between gap-4">
                    <span style={{ color: MUTED_TEXT }}>
                        {cut.sourceType === 'commentary' ? 'Com' : 'Mov'} {cut.sortOrder}{' '}
                        <span style={{ color: ACCENT_DARK }}>
                            ({msToHMS(cut.startMs)}–{msToHMS(cut.endMs)})
                        </span>
                    </span>
                    <div className="flex items-center gap-2">
                        {[-10, -5].map((d) => (
                            <Button
                                key={d}
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                onClick={() => adjust(cut.id, d * 1000)}
                            >
                                {d}s
                            </Button>
                        ))}
                        <span
                            className="w-16 text-center text-xs px-2 py-1 rounded"
                            style={{
                                color: (offsets[cut.id] ?? 0) !== 0 ? ACCENT_ORANGE : ACCENT_CREAM,
                                backgroundColor: PRIMARY_BACKGROUND,
                                border: `1px solid ${ACCENT_DARK}`,
                            }}
                        >
                            {(offsets[cut.id] ?? 0) >= 0 ? '+' : ''}
                            {Math.round((offsets[cut.id] ?? 0) / 1000)}s
                        </span>
                        {[5, 10].map((d) => (
                            <Button
                                key={d}
                                variant="ghost"
                                className="px-2 py-1 text-xs"
                                onClick={() => adjust(cut.id, d * 1000)}
                            >
                                +{d}s
                            </Button>
                        ))}
                        {(offsets[cut.id] ?? 0) !== 0 && (
                            <button
                                className="text-[10px] underline"
                                style={{ color: MUTED_TEXT }}
                                onClick={() => onResetCut(cut.id)}
                            >
                                reset
                            </button>
                        )}
                    </div>
                </div>
            ))}
        </div>
    )
}
