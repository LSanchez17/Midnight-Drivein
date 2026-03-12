import { clsx } from 'clsx'
import type { HTMLAttributes } from 'react'

interface Props extends HTMLAttributes<HTMLDivElement> {
    title?: string
}

export default function Panel({ title, className, children, style, ...props }: Props) {
    return (
        <div
            className={clsx('rounded-lg overflow-hidden', className)}
            style={{
                backgroundColor: '#15151b',
                border: '1px solid #2a2a33',
                ...style,
            }}
            {...props}
        >
            {title && (
                <div
                    className="px-4 py-2 text-[10px] uppercase tracking-[0.2em]"
                    style={{
                        borderBottom: '1px solid #2a2a33',
                        color: '#b8b1a1',
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
