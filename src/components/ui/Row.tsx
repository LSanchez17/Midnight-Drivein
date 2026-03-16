interface RowProps {
    label: string
    value: React.ReactNode
}

export default function Row({ label, value }: RowProps) {
    return (
        <div className="flex justify-between items-baseline gap-4">
            <span style={{ color: '#b8b1a1' }}>{label}</span>
            <span style={{ color: '#f3ebd2' }} className="tabular-nums">
                {value}
            </span>
        </div>
    )
}
