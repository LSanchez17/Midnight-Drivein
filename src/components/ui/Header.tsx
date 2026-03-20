import { ACCENT_CREAM } from "../../utils/colorConstants"

type HeaderTag = 'h1' | 'h2' | 'h3'

interface HeaderProps {
    title: string
    as?: HeaderTag
    className?: string
}

const Header = ({ title, as: Tag = 'h1', className = '' }: HeaderProps) => {
    return (
        <Tag
            className={className}
            style={{
                color: ACCENT_CREAM,
                fontFamily: 'Impact, "Arial Narrow", sans-serif',
            }}
        >
            {title}
        </Tag>
    )
}

export default Header