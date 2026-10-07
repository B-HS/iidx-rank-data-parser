import type { FC } from 'react'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Card } from '@ui/card'
import { formatDateTime, formatNumber, t, translateMessage } from '@shared/i18n'
import type { Overview } from '@shared/messages'

type RankSyncCardProps = {
    rank: Overview['rank']
    blockReason: string | null
    onSync: () => void
}

const SYNC_STATUS_BADGE = {
    success: { tone: 'success', label: () => t('popup_sync_status_success') },
    failed: { tone: 'danger', label: () => t('popup_sync_status_failed') },
    skipped: { tone: 'warning', label: () => t('popup_sync_status_skipped') },
    pending: { tone: 'neutral', label: () => t('popup_sync_status_pending') },
} as const

const SYNC_TRIGGER_LABEL = {
    auto: () => t('popup_sync_trigger_auto'),
    manual: () => t('popup_sync_trigger_manual'),
} as const

export const RankSyncCard: FC<RankSyncCardProps> = ({ rank, blockReason, onSync }) => {
    const { lastSync, isSyncing } = rank
    const badge = lastSync === null ? null : SYNC_STATUS_BADGE[lastSync.status]
    const hiddenUnmatchedCount = lastSync === null ? 0 : (lastSync.unmatchedCount ?? 0) - lastSync.unmatchedPreview.length

    return (
        <Card title={t('popup_sync_title')} badge={badge === null ? null : <Badge tone={badge.tone}>{badge.label()}</Badge>}>
            <p className='mb-1 break-words text-[11px] leading-relaxed text-muted-foreground'>{t('popup_sync_description')}</p>
            <p className='mb-3 break-words text-[11px] leading-relaxed text-muted-foreground'>{t('popup_settings_note_scope')}</p>

            <Button size='sm' className='w-full' onClick={onSync} disabled={isSyncing || blockReason !== null}>
                {isSyncing ? t('popup_action_syncing') : t('popup_action_sync')}
            </Button>
            {blockReason !== null && !isSyncing && <p className='mt-2 break-words text-[11px] text-muted-foreground'>{blockReason}</p>}

            <div role='status' aria-live='polite' className='mt-3'>
                {lastSync === null && <p className='break-words text-xs text-muted-foreground'>{t('popup_sync_none')}</p>}

                {lastSync !== null && (
                    <>
                        <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
                            <dt className='text-muted-foreground'>{t('popup_label_sync_time')}</dt>
                            <dd>{formatDateTime(lastSync.at)}</dd>
                            <dt className='text-muted-foreground'>{t('popup_label_sync_trigger')}</dt>
                            <dd>{SYNC_TRIGGER_LABEL[lastSync.trigger]()}</dd>
                            {lastSync.user !== null && <dt className='text-muted-foreground'>{t('popup_label_sync_account')}</dt>}
                            {lastSync.user !== null && (
                                <dd className='break-words'>
                                    {lastSync.user.name}
                                    {lastSync.user.handle !== null && ` (@${lastSync.user.handle})`}
                                </dd>
                            )}
                            {lastSync.reason !== null && <dt className='text-muted-foreground'>{t('popup_label_reason')}</dt>}
                            {lastSync.reason !== null && (
                                <dd className='break-words'>{translateMessage({ key: `rank_reason_${lastSync.reason}`, params: [] })}</dd>
                            )}
                        </dl>

                        {lastSync.status === 'pending' && (
                            <p className='mt-2 break-words text-[11px] leading-relaxed text-muted-foreground'>{t('popup_sync_pending_hint')}</p>
                        )}

                        {lastSync.serverCode !== null && (
                            <p className='mt-1 break-all text-[11px] text-muted-foreground'>
                                {t('popup_sync_server_code', { code: lastSync.serverCode })}
                            </p>
                        )}

                        {lastSync.status === 'success' && (
                            <dl className='mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground'>
                                <div className='min-w-0'>
                                    <dt>{t('popup_label_received')}</dt>
                                    <dd className='text-foreground'>{formatNumber(lastSync.receivedCount)}</dd>
                                </div>
                                <div className='min-w-0'>
                                    <dt>{t('popup_label_matched')}</dt>
                                    <dd className='text-foreground'>{formatNumber(lastSync.matchedCount)}</dd>
                                </div>
                                <div className='min-w-0'>
                                    <dt>{t('popup_label_changed')}</dt>
                                    <dd className='text-foreground'>{formatNumber(lastSync.changedCount)}</dd>
                                </div>
                                <div className='min-w-0'>
                                    <dt>{t('popup_label_unmatched')}</dt>
                                    <dd className='text-foreground'>{formatNumber(lastSync.unmatchedCount)}</dd>
                                </div>
                            </dl>
                        )}

                        {lastSync.unmatchedPreview.length > 0 && (
                            <div className='mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-800 dark:text-amber-400'>
                                <p className='mb-1 break-words'>{t('popup_sync_unmatched_hint')}</p>
                                <ul className='list-disc space-y-1 pl-4'>
                                    {lastSync.unmatchedPreview.map((chart) => (
                                        <li key={`${chart.title}:${chart.difficulty}`} className='break-words'>
                                            {chart.title} ({chart.difficulty})
                                        </li>
                                    ))}
                                </ul>
                                {hiddenUnmatchedCount > 0 && (
                                    <p className='mt-1'>{t('popup_sync_unmatched_more', { count: hiddenUnmatchedCount })}</p>
                                )}
                            </div>
                        )}
                    </>
                )}
            </div>
        </Card>
    )
}
