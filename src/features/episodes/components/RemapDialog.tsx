import { useEffect, useState } from 'react'
import { listMediaFiles, remapFile } from '../../../api'
import type { MediaFileSummary } from '../../../api/types'
import type { SourceType } from '../types'
import Button from '../../../components/ui/Button'
import TextInput from '../../../components/ui/TextInput'
import { formatBytes } from '../../../utils/Files'

interface RemapDialogProps {
    slotId: string
    fileType: SourceType
    folderRoot: 'movies' | 'commentary'
    onClose: () => void
    onConfirmed: () => void
}

export default function RemapDialog({
    slotId,
    fileType,
    folderRoot,
    onClose,
    onConfirmed,
}: RemapDialogProps) {
    const [files, setFiles] = useState<MediaFileSummary[]>([])
    const [loading, setLoading] = useState(true)
    const [loadError, setLoadError] = useState<string | null>(null)
    const [query, setQuery] = useState('')
    const [selectedId, setSelectedId] = useState<string | null>(null)
    const [saving, setSaving] = useState(false)
    const [saveError, setSaveError] = useState<string | null>(null)

    useEffect(() => {
        listMediaFiles(folderRoot)
            .then((rows) => {
                setFiles(rows)
                setLoading(false)
            })
            .catch((e) => {
                setLoadError(String(e?.message ?? e))
                setLoading(false)
            })
    }, [folderRoot])

    const filtered = files.filter((f) => {
        const q = query.toLowerCase()

        return (
            f.filename.toLowerCase().includes(q) ||
            (f.displayName ?? '').toLowerCase().includes(q)
        )
    })

    async function handleConfirm() {
        if (!selectedId) return

        setSaving(true)
        setSaveError(null)

        try {
            await remapFile(slotId, fileType, selectedId)
            onConfirmed()
            onClose()
        } catch (e: unknown) {
            setSaveError(String((e as { message?: string })?.message ?? e))
            setSaving(false)
        }
    }

    const label = fileType === 'movie' ? 'Movie File' : 'Commentary File'

    return (
        <>
            <h2
                className="text-xl uppercase tracking-[0.15em]"
                style={{
                    color: '#f3ebd2',
                    fontFamily: 'Impact, "Arial Narrow", sans-serif',
                }}
            >
                Remap — {label}
            </h2>
            {loading && (
                <p className="text-sm" style={{ color: '#b8b1a1' }}>
                    Loading files…
                </p>
            )}
            {loadError && (
                <p className="text-sm" style={{ color: '#f87171' }}>
                    {loadError}
                </p>
            )}
            {!loading && !loadError && (
                <>
                    <TextInput
                        placeholder="Search files…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                    />

                    {filtered.length === 0 ? (
                        <p className="text-sm" style={{ color: '#b8b1a1' }}>
                            No files found.
                        </p>
                    ) : (
                        <div
                            className="overflow-y-auto rounded"
                            style={{
                                maxHeight: '320px',
                                border: '1px solid #2a2a33',
                            }}
                        >
                            {filtered.map((file) => (
                                <button
                                    key={file.id}
                                    className="w-full text-left px-3 py-2 transition-colors"
                                    style={{
                                        backgroundColor:
                                            selectedId === file.id ? '#1e1e28' : 'transparent',
                                        borderBottom: '1px solid #2a2a33',
                                        cursor: 'pointer',
                                    }}
                                    onClick={() => setSelectedId(file.id)}
                                >
                                    <p
                                        className="text-sm truncate"
                                        style={{ color: '#f3ebd2' }}
                                    >
                                        {file.displayName ?? file.filename}
                                    </p>
                                    <p
                                        className="text-xs truncate mt-0.5"
                                        style={{ color: '#b8b1a1' }}
                                    >
                                        {file.path}
                                    </p>
                                    <p
                                        className="text-xs mt-0.5"
                                        style={{ color: '#b8b1a1' }}
                                    >
                                        {formatBytes(file.sizeBytes)}
                                    </p>
                                </button>
                            ))}
                        </div>
                    )}
                </>
            )}
            {saveError && (
                <p
                    className="text-sm rounded px-3 py-2"
                    style={{
                        color: '#f87171',
                        backgroundColor: '#1a0a0a',
                        border: '1px solid #7f1d1d',
                    }}
                >
                    {saveError}
                </p>
            )}
            <div className="flex gap-3 justify-end">
                <Button variant="ghost" onClick={onClose} disabled={saving}>
                    Cancel
                </Button>
                <Button
                    variant="primary"
                    onClick={handleConfirm}
                    disabled={!selectedId || saving}
                >
                    {saving ? 'Saving…' : 'Confirm Remap'}
                </Button>
            </div>
        </>
    )
}
