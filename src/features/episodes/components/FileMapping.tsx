import Button from '../../../components/ui/Button'
import type { FileMatch, SourceType } from '../types'

interface FileMappingProps {
    matches: FileMatch[]
    onRemap: (fileType: SourceType) => void
}

export default function FileMapping({
    matches,
    onRemap,
}: FileMappingProps) {
    return (
        <div className="space-y-3 mb-4">
            <p className="text-[10px] uppercase tracking-[0.15em]" style={{ color: '#b8b1a1' }}>
                File Mapping
            </p>
            {matches.map((match) => (
                <div
                    key={match.fileType}
                    className="flex items-center justify-between gap-4 text-sm pb-3 last:pb-0"
                    style={{ borderBottom: '1px solid #2a2a33' }}
                >
                    <div className="min-w-0">
                        <p
                            className="text-[10px] uppercase tracking-[0.15em] mb-0.5"
                            style={{ color: '#b8b1a1' }}
                        >
                            {match.fileType === 'movie' ? 'Movie File' : 'Commentary File'}
                        </p>
                        <p
                            className="truncate"
                            style={{
                                color: match.status === 'missing' ? '#f87171' : '#f3ebd2',
                            }}
                        >
                            {match.displayName ?? match.filename ?? 'No file matched'}
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
                        onClick={() => onRemap(match.fileType)}
                    >
                        Remap
                    </Button>
                </div>
            ))}
        </div>
    )
}
