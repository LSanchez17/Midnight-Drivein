import { clsx } from 'clsx'
import type { InputHTMLAttributes } from 'react'

export default function TextInput({ className, style, ...props }: InputHTMLAttributes<HTMLInputElement>) {
    return (
        <input
            className={clsx(
                'w-full rounded px-3 py-2 text-sm transition-colors outline-none',
                className,
            )}
            style={{
                backgroundColor: '#0b0b0f',
                border: '1px solid #2a2a33',
                color: '#f3ebd2',
                ...style,
            }}
            onFocus={(e) => {
                e.currentTarget.style.borderColor = '#8b1e2d'
            }}
            onBlur={(e) => {
                e.currentTarget.style.borderColor = '#2a2a33'
            }}
            {...props}
        />
    )
}
