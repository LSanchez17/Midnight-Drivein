import { useState } from 'react'
import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import TextInput from '../components/ui/TextInput'
import { useSettings } from '../context/SettingsContext'
import { saveSettings, selectLibraryRoot, scanLibrary } from '../api'
import { ApiError } from '../api/errors'

function Label({ children }: { children: React.ReactNode }) {
    return (
        <p
            className="text-[10px] uppercase tracking-[0.2em] mb-1"
            style={{ color: '#b8b1a1' }}
        >
            {children}
        </p>
    )
}

function FieldError({ message }: { message: string | null }) {
    if (!message) return null
    return (
        <p className="text-xs mt-1" style={{ color: '#f87171' }}>
            {message}
        </p>
    )
}

function FolderRow({
    label,
    value,
    placeholder,
    ariaLabel,
    disabled,
    onChoose,
    error,
}: {
    label: string
    value: string | null | undefined
    placeholder: string
    ariaLabel: string
    disabled: boolean
    onChoose: () => void
    error: string | null
}) {
    return (
        <div>
            <Label>{label}</Label>
            <div className="flex gap-2">
                <TextInput
                    placeholder={placeholder}
                    readOnly
                    value={value ?? ''}
                    className="flex-1"
                    aria-label={ariaLabel}
                    style={{ opacity: disabled ? 0.5 : 1 }}
                />
                <Button variant="ghost" onClick={onChoose} disabled={disabled}>
                    {value ? 'Change Folder' : 'Choose Folder'}
                </Button>
            </div>
            <FieldError message={error} />
        </div>
    )
}

export default function SettingsPage() {
    const { settings, isLoading, reloadSettings } = useSettings()

    const [moviesFolderError, setMoviesFolderError] = useState<string | null>(null)
    const [segmentsFolderError, setSegmentsFolderError] = useState<string | null>(null)
    const [scanToggleError, setScanToggleError] = useState<string | null>(null)

    async function handleChooseFolder(field: 'moviesFolder' | 'segmentsFolder') {
        const setError = field === 'moviesFolder' ? setMoviesFolderError : setSegmentsFolderError
        setError(null)
        try {
            const path = await selectLibraryRoot()

            // cancelled dialog is not an error, but we shouldn't try to save null to settings
            if (path === null) return

            await saveSettings({ [field]: path })
            reloadSettings()
        } catch (e) {
            setError(e instanceof ApiError ? e.message : String(e))
        }
    }

    async function handleScanOnStartupChange(checked: boolean) {
        setScanToggleError(null)
        try {
            await saveSettings({ scanOnStartup: checked })
            reloadSettings()
        } catch (e) {
            setScanToggleError(e instanceof ApiError ? e.message : String(e))
        }
    }

    const bothFoldersSet = Boolean(settings?.moviesFolder && settings?.segmentsFolder)

    return (
        <div className="space-y-6 max-w-2xl">
            <h1
                className="text-4xl uppercase tracking-[0.15em]"
                style={{
                    color: '#f3ebd2',
                    fontFamily: 'Impact, "Arial Narrow", sans-serif',
                }}
            >
                Settings
            </h1>

            {/* Library Root */}
            <Panel title="Library Root">
                <div className="space-y-4 text-sm">
                    <FolderRow
                        label="Movies Folder"
                        value={settings?.moviesFolder}
                        placeholder="e.g. /Users/you/Movies"
                        ariaLabel="Movies folder path"
                        disabled={isLoading}
                        onChoose={() => handleChooseFolder('moviesFolder')}
                        error={moviesFolderError}
                    />
                    <FolderRow
                        label="Segments Folder"
                        value={settings?.segmentsFolder}
                        placeholder="e.g. /Users/you/NonMovieSegments"
                        ariaLabel="Segments folder path"
                        disabled={isLoading}
                        onChoose={() => handleChooseFolder('segmentsFolder')}
                        error={segmentsFolderError}
                    />
                    <Button
                        variant="primary"
                        disabled={!bothFoldersSet}
                        title={bothFoldersSet ? undefined : 'Configure both folders first'}
                        onClick={() => {
                            if (bothFoldersSet) scanLibrary().catch(() => {/* stub — spec 0008 */ })
                        }}
                    >
                        Rescan Library
                    </Button>
                </div>
            </Panel>

            {/* Scan Preferences */}
            <Panel title="Scan Preferences">
                <div className="space-y-2 text-sm">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={settings?.scanOnStartup ?? false}
                            disabled={isLoading}
                            onChange={(e) => handleScanOnStartupChange(e.target.checked)}
                            className="w-4 h-4 accent-[#8b1e2d] cursor-pointer"
                        />
                        <span style={{ color: '#f3ebd2' }}>Scan library on startup</span>
                    </label>
                    <FieldError message={scanToggleError} />
                    <p className="text-xs" style={{ color: '#b8b1a1' }}>
                        Fuzzy-match thresholds and additional scan settings will appear here in a future phase.
                    </p>
                </div>
            </Panel>

            {/* Metadata */}
            <Panel title="Metadata">
                <div className="space-y-3 text-sm">
                    <div className="flex gap-3">
                        <Button variant="ghost">Import Metadata</Button>
                        <Button variant="ghost">Export Metadata</Button>
                    </div>
                    <p style={{ color: '#b8b1a1' }}>
                        Metadata is stored locally in a SQLite database on your machine. It is never uploaded or
                        shared.
                    </p>
                </div>
            </Panel>

            {/* Appearance */}
            <Panel title="Appearance">
                <p className="text-sm" style={{ color: '#b8b1a1' }}>
                    Theme options will appear here in a future phase.
                </p>
            </Panel>

            {/* About / Legal */}
            <Panel title="About">
                <div className="space-y-3 text-sm" style={{ color: '#b8b1a1' }}>
                    <p className="leading-relaxed">
                        <strong style={{ color: '#f3ebd2' }}>Midnight Drive-In</strong> is a local-only media
                        organizer. It does not host, stream, download, or distribute any media. All files remain
                        on your machine at all times.
                    </p>
                    <p className="leading-relaxed">
                        This application is a personal tool for organizing files you already own. Use it
                        responsibly and in accordance with applicable copyright law.
                    </p>
                </div>
            </Panel>
        </div>
    )
}
