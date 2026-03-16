import type { ScanResult } from '../../api/types'

interface Props {
    result: ScanResult | null
    isScanning: boolean
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex justify-between items-baseline gap-4">
            <span style={{ color: '#b8b1a1' }}>{label}</span>
            <span style={{ color: '#f3ebd2' }} className="tabular-nums">
                {value}
            </span>
        </div>
    )
}

function formatDate(iso: string): string {
    try {
        return new Intl.DateTimeFormat('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
        }).format(new Date(iso))
    } catch {
        return iso
    }
}

export default function ScanSummaryPanel({ result, isScanning }: Props) {
    if (isScanning) {
        return (
            <p className="text-sm mt-3" style={{ color: '#b8b1a1' }}>
                Scanning…
            </p>
        )
    }

    if (!result) {
        return (
            <p className="text-sm mt-3" style={{ color: '#b8b1a1' }}>
                No scan has been run yet.
            </p>
        )
    }

    const hasWarnings = result.errors.length > 0
    const hasMissingFolders = result.missingFolders.length > 0

    return (
        <div className="mt-4 space-y-3 text-sm">
            {/* File counts */}
            <div className="space-y-1">
                <Row label="Last scan" value={formatDate(result.lastScanAt)} />
                <Row label="Movie files" value={result.movieFileCount} />
                <Row label="Segment files" value={result.segmentFileCount} />
            </div>

            {/* Missing folders — shown as a separate section, always expanded */}
            {hasMissingFolders && (
                <div>
                    <p
                        className="text-[10px] uppercase tracking-[0.2em] mb-1"
                        style={{ color: '#f87171' }}
                    >
                        Missing Folders
                    </p>
                    <ul className="space-y-0.5">
                        {result.missingFolders.map((folder) => (
                            <li
                                key={folder}
                                className="text-xs font-mono break-all"
                                style={{ color: '#f87171' }}
                            >
                                {folder}
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            {/* Per-file / walk warnings — collapsed by default */}
            {hasWarnings && (
                <details>
                    <summary
                        className="cursor-pointer text-xs select-none"
                        style={{ color: '#f87171' }}
                    >
                        {result.errors.length} warning{result.errors.length !== 1 ? 's' : ''}
                    </summary>
                    <ul className="mt-1 space-y-0.5 pl-3">
                        {result.errors.map((msg, i) => (
                            <li key={i} className="text-xs break-all" style={{ color: '#f87171' }}>
                                {msg}
                            </li>
                        ))}
                    </ul>
                </details>
            )}
        </div>
    )
}
