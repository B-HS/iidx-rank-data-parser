import { useState } from 'react'
import type { FC } from 'react'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Card } from '@ui/card'
import { RADAR_AXES } from '@shared/domain'
import { formatDateTime, formatNumber, t } from '@shared/i18n'
import type { Overview } from '@shared/messages'

type SavedDatasetCardProps = {
    dataset: Overview['dataset']
    disabled: boolean
    disabledReason: string | null
    onExport: () => void
    onExportRank: () => void
    onClear: () => void
}

const RADAR_FRACTION_DIGITS = 2
const STYLE_LABEL = { 0: 'SP', 1: 'DP' } as const

const DATASET_STATUS_BADGE = {
    empty: { tone: 'neutral', label: () => t('popup_dataset_status_empty') },
    partial: { tone: 'warning', label: () => t('popup_dataset_status_partial') },
    complete: { tone: 'success', label: () => t('popup_dataset_status_complete') },
} as const

export const SavedDatasetCard: FC<SavedDatasetCardProps> = ({ dataset, disabled, disabledReason, onExport, onExportRank, onClear }) => {
    const [isConfirmingClear, setIsConfirmingClear] = useState(false)

    const handleConfirmClear = () => {
        setIsConfirmingClear(false)
        onClear()
    }

    if (dataset === null) {
        return (
            <Card title={t('popup_dataset_title')}>
                <p className='break-words text-xs text-muted-foreground'>{t('popup_dataset_empty')}</p>
            </Card>
        )
    }

    const status = DATASET_STATUS_BADGE[dataset.status]

    return (
        <Card title={t('popup_dataset_title')} badge={<Badge tone={status.tone}>{status.label()}</Badge>}>
            <dl className='grid grid-cols-2 gap-2 text-xs'>
                <div className='min-w-0'>
                    <dt className='text-muted-foreground'>{t('popup_label_chart_count')}</dt>
                    <dd className='font-medium'>{formatNumber(dataset.chartCount)}</dd>
                </div>
                <div className='min-w-0'>
                    <dt className='text-muted-foreground'>{t('popup_label_style')}</dt>
                    <dd className='font-medium'>{STYLE_LABEL[dataset.style]}</dd>
                </div>
                <div className='min-w-0'>
                    <dt className='text-muted-foreground'>DJ NAME</dt>
                    <dd className='break-words font-medium'>{dataset.djName ?? '-'}</dd>
                </div>
                <div className='min-w-0'>
                    <dt className='text-muted-foreground'>{t('popup_label_generated')}</dt>
                    <dd className='break-words'>{formatDateTime(dataset.generatedAt)}</dd>
                </div>
            </dl>

            {dataset.notesRadar !== null && (
                <ul className='mt-3 grid grid-cols-3 gap-2 text-[11px]'>
                    {RADAR_AXES.map((axis) => (
                        <li key={axis} className='min-w-0 rounded border border-border px-2 py-1'>
                            <span className='block text-muted-foreground'>{axis}</span>
                            <span className='font-medium'>{formatNumber(dataset.notesRadar?.values[axis] ?? null, RADAR_FRACTION_DIGITS)}</span>
                        </li>
                    ))}
                </ul>
            )}

            <div className='mt-3 flex gap-2'>
                <Button size='sm' className='flex-1' onClick={onExport} disabled={disabled}>
                    {t('popup_action_export_dataset')}
                </Button>
                <Button size='sm' variant='outline' className='flex-1' onClick={onExportRank} disabled={disabled}>
                    {t('popup_action_export_rank')}
                </Button>
            </div>

            {disabledReason !== null && <p className='mt-2 break-words text-[11px] text-muted-foreground'>{disabledReason}</p>}

            {isConfirmingClear ? (
                <div role='alert' className='mt-2 rounded border border-destructive/40 bg-destructive/10 p-2'>
                    <p className='mb-2 break-words text-[11px] text-destructive'>{t('popup_clear_confirm_message')}</p>
                    <div className='flex gap-2'>
                        <Button size='sm' variant='destructive' className='flex-1' onClick={handleConfirmClear}>
                            {t('popup_action_clear_confirm')}
                        </Button>
                        <Button size='sm' variant='outline' className='flex-1' onClick={() => setIsConfirmingClear(false)}>
                            {t('popup_action_back')}
                        </Button>
                    </div>
                </div>
            ) : (
                <Button
                    size='sm'
                    variant='ghost'
                    className='mt-2 w-full text-destructive'
                    onClick={() => setIsConfirmingClear(true)}
                    disabled={disabled}>
                    {t('popup_action_clear')}
                </Button>
            )}
        </Card>
    )
}
