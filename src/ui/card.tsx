import { useId } from 'react'
import type { FC, ReactNode } from 'react'
import { cn } from '@shared/cn'

type CardProps = {
    title: string
    badge?: ReactNode
    children: ReactNode
    className?: string
}

export const Card: FC<CardProps> = ({ title, badge, children, className }) => {
    const titleId = useId()

    return (
        <section aria-labelledby={titleId} className={cn('rounded-lg border border-border bg-card p-3', className)}>
            <header className='mb-2 flex items-start justify-between gap-2'>
                <h2 id={titleId} className='min-w-0 break-words text-xs font-semibold text-muted-foreground'>
                    {title}
                </h2>
                {badge}
            </header>
            {children}
        </section>
    )
}
