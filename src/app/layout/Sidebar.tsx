import { NavLink } from 'react-router-dom'
import { clsx } from 'clsx'

const links = [
    { to: '/library', label: 'Library', icon: '🎞' },
    { to: '/settings', label: 'Settings', icon: '⚙' },
]

export default function Sidebar() {
    return (
        <aside
            className="flex flex-col w-52 shrink-0 min-h-screen px-4 py-6 gap-2"
            style={{ backgroundColor: '#15151b', borderRight: '1px solid #2a2a33' }}
        >
            {/* Logo / wordmark */}
            <div className="mb-8 px-1">
                <p
                    className="text-xs tracking-[0.25em] uppercase mb-0.5"
                    style={{ color: '#8b1e2d', fontFamily: 'Impact, "Arial Narrow", sans-serif' }}
                >
                    Midnight
                </p>
                <p
                    className="text-2xl tracking-[0.2em] uppercase leading-none"
                    style={{ color: '#f3ebd2', fontFamily: 'Impact, "Arial Narrow", sans-serif' }}
                >
                    Drive‑In
                </p>
                <div className="mt-2 h-px w-full" style={{ backgroundColor: '#2a2a33' }} />
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
                                    ? 'text-[#f3ebd2]'
                                    : 'text-[#b8b1a1] hover:text-[#f3ebd2]'
                            )
                        }
                        style={({ isActive }) =>
                            isActive
                                ? { backgroundColor: '#8b1e2d' }
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
