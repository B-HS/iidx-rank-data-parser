import type { ReactNode } from 'react'
import { cn } from '@shared/cn'

type BadgeProps = {
    children: ReactNode
    tone?: 'neutral' | 'success' | 'warning' | 'danger'
    className?: string
}

const TONE_CLASSES = {
    neutral: 'border-border bg-secondary text-secondary-foreground',
    success: 'border-transparent bg-success text-success-foreground',
    warning: 'border-transparent bg-amber-500 text-white',
    danger: 'border-transparent bg-destructive text-destructive-foreground',
} as const

export const Badge = ({ children, tone = 'neutral', className }: BadgeProps) => (
    <span
        className={cn(
            'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium leading-none',
            TONE_CLASSES[tone],
            className,
        )}>
        {children}
    </span>
)
