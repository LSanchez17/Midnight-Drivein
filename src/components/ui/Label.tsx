interface LabelProps {
    children: React.ReactNode
}

export default function Label({ children }: LabelProps) {
    return (
        <p
            className="text-[10px] uppercase tracking-[0.2em] mb-1"
            style={{ color: '#b8b1a1' }}
        >
            {children}
        </p>
    )
}
