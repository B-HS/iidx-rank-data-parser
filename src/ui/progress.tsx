import { cn } from '@shared/cn'

type ProgressProps = {
    value: number
    label: string
    className?: string
}

export const Progress = ({ value, label, className }: ProgressProps) => (
    <div
        className={cn('relative h-2 w-full overflow-hidden rounded-full bg-secondary', className)}
        role='progressbar'
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(value)}>
        <div
            className='h-full w-full flex-1 bg-primary transition-all'
            style={{ transform: `translateX(-${100 - Math.min(100, Math.max(0, value))}%)` }}
        />
    </div>
)
