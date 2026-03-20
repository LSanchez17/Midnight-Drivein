import { ACCENT_DARK, MUTED_TEXT, SECONDARY_BACKGROUND } from "../../utils/colorConstants"

interface LoadingSkeletonProps {
    simple?: boolean
    itemCount?: number
    className?: string
}

const LoadingSkeleton = ({ simple = false, itemCount = 4, className = '' }: LoadingSkeletonProps) => {
    if (simple) {
        return (
            <div
                className="flex items-center justify-center animate-pulse"
                style={{ height: 160, color: MUTED_TEXT }}
            >
                Loading…
            </div>
        )
    }


    return (
        <div className={className}>
            {[...Array(itemCount)].map((_, i) => (
                <div
                    key={i}
                    className="rounded-lg h-24 animate-pulse"
                    style={{ backgroundColor: SECONDARY_BACKGROUND, border: `1px solid ${ACCENT_DARK}` }}
                />
            ))}
        </div>
    )
}

export default LoadingSkeleton