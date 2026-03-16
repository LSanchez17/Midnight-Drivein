import Button from './Button'
import TextInput from './TextInput'
import Label from './Label'
import FieldError from './FieldError'

interface FolderRowProps {
    label: string
    value: string | null | undefined
    placeholder: string
    ariaLabel: string
    disabled: boolean
    onChoose: () => void
    error: string | null
}

export default function FolderRow({
    label,
    value,
    placeholder,
    ariaLabel,
    disabled,
    onChoose,
    error,
}: FolderRowProps) {
    return (
        <div>
            <Label>{label}</Label>
            <div className="flex gap-2">
                <TextInput
                    placeholder={placeholder}
                    readOnly
                    value={value ?? ''}
                    className="flex-1"
                    aria-label={ariaLabel}
                    style={{ opacity: disabled ? 0.5 : 1 }}
                />
                <Button variant="ghost" onClick={onChoose} disabled={disabled}>
                    {value ? 'Change Folder' : 'Choose Folder'}
                </Button>
            </div>
            <FieldError message={error} />
        </div>
    )
}
