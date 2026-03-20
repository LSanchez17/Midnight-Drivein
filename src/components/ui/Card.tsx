import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'
import { ACCENT_DARK, SECONDARY_BACKGROUND } from '../../utils/colorConstants'

export default function Card({ className, children, style, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={clsx('rounded-lg p-4 transition-colors', className)}
            style={{
                backgroundColor: SECONDARY_BACKGROUND,
                border: `1px solid ${ACCENT_DARK}`,
                ...style,
            }}
            {...props}
        >
            {children}
        </div>
    )
}
