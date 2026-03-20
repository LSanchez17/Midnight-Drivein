import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'
import { ACCENT_CREAM, ACCENT_DARK, ACCENT_RED, MUTED_TEXT, SECONDARY_BACKGROUND } from '../../utils/colorConstants'

const links = [
    { to: '/library', label: 'Library', icon: '🎞' },
    { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Sidebar() {
    return (
        <aside
            className="flex flex-col w-52 shrink-0 min-h-screen px-4 py-6 gap-2"
            style={{ backgroundColor: SECONDARY_BACKGROUND, borderRight: `1px solid ${ACCENT_DARK}` }}
        >
            {/* Logo / wordmark */}
            <div className="mb-8 px-1">
                <p
                    className="text-xs tracking-[0.25em] uppercase mb-0.5"
                    style={{ color: ACCENT_RED, fontFamily: 'Impact, "Arial Narrow", sans-serif' }}
                >
                    Midnight
                </p>
                <p
                    className="text-2xl tracking-[0.2em] uppercase leading-none"
                    style={{ color: ACCENT_CREAM, fontFamily: 'Impact, "Arial Narrow", sans-serif' }}
                >
                    Drive‑In
                </p>
                <div className="mt-2 h-px w-full" style={{ backgroundColor: ACCENT_DARK }} />
            </div>

            <nav className="flex flex-col gap-1">
                {links.map(({ to, label, icon }) => (
                    <NavLink
                        key={to}
                        to={to}
                        className={({ isActive }) =>
                            clsx(
                                'flex items-center gap-2 px-3 py-2 rounded text-sm transition-colors',
                                isActive
                                    ? `text-[${ACCENT_CREAM}]`
                                    : `text-[${MUTED_TEXT}] hover:text-[${ACCENT_CREAM}]`
                            )
                        }
                        style={({ isActive }) =>
                            isActive
                                ? { backgroundColor: ACCENT_RED }
                                : undefined
                        }
                    >
                        <span>{icon}</span>
                        {label}
                    </NavLink>
                ))}
            </nav>

            {/* Bottom badge */}
            <div className="mt-auto">
                <p
                    className="text-[10px] tracking-widest uppercase px-1"
                    style={{ color: '#ffffff' }}
                >
                    v0.1.0 · Phase 1
                </p>
            </div>
        </aside>
    )
}
