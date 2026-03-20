import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'
import { ACCENT_DARK, MUTED_TEXT, SECONDARY_BACKGROUND } from '../../utils/colorConstants'

interface PanelProps extends HTMLAttributes<HTMLDivElement> {
    title?: string
}

export default function Panel({ title, className, children, style, ...props }: PanelProps) {
    return (
        <div
            className={clsx('rounded-lg overflow-hidden', className)}
            style={{
                backgroundColor: SECONDARY_BACKGROUND,
                border: `1px solid ${ACCENT_DARK}`,
                ...style,
            }}
            {...props}
        >
            {title && (
                <div
                    className="px-4 py-2 text-[10px] uppercase tracking-[0.2em]"
                    style={{
                        borderBottom: `1px solid ${ACCENT_DARK}`,
                        color: MUTED_TEXT,
                        fontFamily: '"Inter", system-ui, sans-serif',
                    }}
                >
                    {title}
                </div>
            )}
            <div className="p-4">{children}</div>
        </div>
    )
}
