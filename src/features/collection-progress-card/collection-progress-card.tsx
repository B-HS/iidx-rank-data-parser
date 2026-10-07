import type { FC } from 'react'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Card } from '@ui/card'
import { Progress } from '@ui/progress'
import { formatDateTime, formatNumber, t, translateMessage } from '@shared/i18n'
import type { CollectionState } from '@shared/schema'

type CollectionProgressCardProps = {
    collection: CollectionState
    onCancel: () => void
}

const WARNING_PREVIEW_LIMIT = 4

const STATUS_BADGE = {
    idle: { tone: 'neutral', label: () => t('popup_collection_status_idle') },
    running: { tone: 'warning', label: () => t('popup_collection_status_running') },
    completed: { tone: 'success', label: () => t('popup_collection_status_completed') },
    failed: { tone: 'danger', label: () => t('popup_collection_status_failed') },
    cancelled: { tone: 'neutral', label: () => t('popup_collection_status_cancelled') },
} as const

const DATASET_STATUS_BADGE = {
    empty: { tone: 'neutral', label: () => t('popup_dataset_status_empty') },
    partial: { tone: 'warning', label: () => t('popup_dataset_status_partial') },
    complete: { tone: 'success', label: () => t('popup_dataset_status_complete') },
} as const

export const CollectionProgressCard: FC<CollectionProgressCardProps> = ({ collection, onCancel }) => {
    const status = STATUS_BADGE[collection.status]
    const datasetStatus = collection.datasetStatus === null ? null : DATASET_STATUS_BADGE[collection.datasetStatus]
    const hiddenWarningCount = collection.warnings.length - WARNING_PREVIEW_LIMIT

    return (
        <Card
            title={t('popup_progress_title')}
            badge={
                <div className='flex flex-wrap justify-end gap-1'>
                    {datasetStatus !== null && <Badge tone={datasetStatus.tone}>{datasetStatus.label()}</Badge>}
                    <Badge tone={status.tone}>{status.label()}</Badge>
                </div>
            }>
            <Progress value={collection.percent} label={t('popup_progress_label')} />

            <div role='status' aria-live='polite' className='mt-2 break-words text-xs'>
                {collection.message === null ? t('popup_progress_idle') : translateMessage(collection.message)}
                {collection.status === 'running' && ` (${formatNumber(Math.round(collection.percent))}%)`}
            </div>

            {collection.error !== null && (
                <p role='alert' className='mt-2 break-words rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive'>
                    {translateMessage(collection.error)}
                </p>
            )}

            <dl className='mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground'>
                <div className='min-w-0'>
                    <dt>{t('popup_label_charts')}</dt>
                    <dd className='text-foreground'>{formatNumber(collection.chartCount)}</dd>
                </div>
                <div className='min-w-0'>
                    <dt>{t('popup_label_pages')}</dt>
                    <dd className='text-foreground'>{formatNumber(collection.pagesFetched)}</dd>
                </div>
                <div className='min-w-0'>
                    <dt>{t('popup_label_started')}</dt>
                    <dd className='break-words text-foreground'>{formatDateTime(collection.startedAt)}</dd>
                </div>
            </dl>

            {collection.warnings.length > 0 && (
                <div className='mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-400'>
                    <p className='mb-1 font-medium'>{t('popup_warnings_heading', { count: collection.warnings.length })}</p>
                    <ul className='list-disc space-y-1 pl-4'>
                        {collection.warnings.slice(0, WARNING_PREVIEW_LIMIT).map((warning, index) => (
                            <li key={`${warning.key}:${warning.params.join(',')}:${index}`} className='break-words'>
                                {translateMessage(warning)}
                            </li>
                        ))}
                    </ul>
                    {hiddenWarningCount > 0 && <p className='mt-1'>{t('popup_warnings_more', { count: hiddenWarningCount })}</p>}
                </div>
            )}

            {collection.status === 'running' && (
                <Button variant='destructive' size='sm' className='mt-3 w-full' onClick={onCancel}>
                    {t('popup_action_cancel')}
                </Button>
            )}
        </Card>
    )
}
