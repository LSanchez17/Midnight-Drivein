import Button from '../../../components/ui/Button'
import { msToHMS } from '../../../utils/Time'
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
            <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: '#b8b1a1' }}>
                Offset Adjustment
            </p>
            {cuts.map((cut) => (
                <div key={cut.id} className="flex items-center justify-between gap-4">
                    <span style={{ color: '#b8b1a1' }}>
                        {cut.sourceType === 'commentary' ? 'Com' : 'Mov'} {cut.sortOrder}{' '}
                        <span style={{ color: '#2a2a33' }}>
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
                                color: (offsets[cut.id] ?? 0) !== 0 ? '#fdba74' : '#f3ebd2',
                                backgroundColor: '#0b0b0f',
                                border: '1px solid #2a2a33',
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
                                style={{ color: '#b8b1a1' }}
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
