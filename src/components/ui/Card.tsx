import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

export default function Card({ className, children, style, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={clsx('rounded-lg p-4 transition-colors', className)}
            style={{
                backgroundColor: '#15151b',
                border: '1px solid #2a2a33',
                ...style,
            }}
            {...props}
        >
            {children}
        </div>
    )
}
