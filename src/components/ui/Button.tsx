import { clsx } from 'clsx'
import type { ButtonHTMLAttributes } from 'react'

type Variant = 'primary' | 'ghost' | 'danger'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: Variant
}

export default function Button({ variant = 'primary', className, children, ...props }: Props) {
    const base =
        'inline-flex items-center justify-center gap-2 px-4 py-2 rounded text-sm transition-all ' +
        'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 ' +
        'disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer'

    const styles: Record<Variant, React.CSSProperties> = {
        primary: { backgroundColor: '#8b1e2d', color: '#f3ebd2', border: '1px solid #8b1e2d' },
        ghost: { backgroundColor: 'transparent', color: '#b8b1a1', border: '1px solid #2a2a33' },
        danger: { backgroundColor: 'transparent', color: '#f87171', border: '1px solid #7f1d1d' },
    }

    return (
        <button
            className={clsx(base, className)}
            style={styles[variant]}
            onMouseEnter={(e) => {
                if (variant === 'ghost') {
                    ; (e.currentTarget as HTMLElement).style.color = '#f3ebd2'
                        ; (e.currentTarget as HTMLElement).style.borderColor = '#f3ebd2'
                }
                if (variant === 'primary') {
                    ; (e.currentTarget as HTMLElement).style.filter = 'brightness(1.15)'
                }
            }}
            onMouseLeave={(e) => {
                ; (e.currentTarget as HTMLElement).style.filter = ''
                if (variant === 'ghost') {
                    ; (e.currentTarget as HTMLElement).style.color = '#b8b1a1'
                        ; (e.currentTarget as HTMLElement).style.borderColor = '#2a2a33'
                }
            }}
            {...props}
        >
            {children}
        </button>
    )
}
