import Panel from '../components/ui/Panel'
import Button from '../components/ui/Button'
import TextInput from '../components/ui/TextInput'

function SectionHeader({ children }: { children: React.ReactNode }) {
    return (
        <h2
            className="text-2xl uppercase tracking-[0.15em]"
            style={{
                color: '#f3ebd2',
                fontFamily: 'Impact, "Arial Narrow", sans-serif',
            }}
        >
            {children}
        </h2>
    )
}

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

export default function SettingsPage() {
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
                    <div>
                        <Label>Movies Folder</Label>
                        <div className="flex gap-2">
                            <TextInput
                                placeholder="C:\Users\you\Movies"
                                readOnly
                                defaultValue=""
                                className="flex-1"
                                aria-label="Movies folder path"
                            />
                            <Button variant="ghost">Choose Folder</Button>
                        </div>
                    </div>
                    <div>
                        <Label>Segments Folder</Label>
                        <div className="flex gap-2">
                            <TextInput
                                placeholder="C:\Users\you\Segments"
                                readOnly
                                defaultValue=""
                                className="flex-1"
                                aria-label="Segments folder path"
                            />
                            <Button variant="ghost">Choose Folder</Button>
                        </div>
                    </div>
                    <Button variant="primary">Rescan Library</Button>
                </div>
            </Panel>

            {/* Scan Preferences */}
            <Panel title="Scan Preferences">
                <p className="text-sm" style={{ color: '#b8b1a1' }}>
                    Fuzzy-match thresholds and scan settings will appear here in a future phase.
                </p>
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
                    <p
                        className="text-[10px] pt-2"
                        style={{ borderTop: '1px solid #2a2a33', color: '#ffffff' }}
                    >
                        v0.1.0 · Phase 1 UI Shell · Local-first · No network required
                    </p>
                </div>
            </Panel>
        </div>
    )
}
