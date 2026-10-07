import type { FC } from 'react'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Card } from '@ui/card'
import { t } from '@shared/i18n'
import type { Overview } from '@shared/messages'

type RankAccountCardProps = {
    rank: Overview['rank']
    disabled: boolean
    onOpenLogin: () => void
    onRecheck: () => void
}

const getAccountState = (session: Overview['rank']['session']) => {
    if (session === null) return 'unchecked'
    if (session.error !== null) return session.error

    return session.user === null ? 'logged_out' : 'logged_in'
}

const BADGE_BY_STATE = {
    unchecked: { tone: 'neutral', label: () => t('popup_status_unchecked') },
    network: { tone: 'warning', label: () => t('popup_status_check_failed') },
    server_error: { tone: 'warning', label: () => t('popup_status_check_failed') },
    logged_in: { tone: 'success', label: () => t('popup_status_logged_in') },
    logged_out: { tone: 'danger', label: () => t('popup_status_logged_out') },
} as const

const HINT_BY_STATE = {
    unchecked: () => t('popup_rank_hint_unchecked'),
    network: () => t('popup_rank_hint_network'),
    server_error: () => t('popup_rank_hint_server_error'),
    logged_in: () => t('popup_rank_hint_logged_in'),
    logged_out: () => t('popup_rank_hint_logged_out'),
} as const

export const RankAccountCard: FC<RankAccountCardProps> = ({ rank, disabled, onOpenLogin, onRecheck }) => {
    const state = getAccountState(rank.session)
    const badge = BADGE_BY_STATE[state]
    const user = rank.session?.user ?? null

    return (
        <Card title={t('popup_rank_title')} badge={<Badge tone={badge.tone}>{badge.label()}</Badge>}>
            <p className='mb-2 break-all text-[11px] text-muted-foreground'>{t('popup_rank_target', { origin: rank.origin })}</p>

            {state === 'logged_in' && user !== null && (
                <dl className='mb-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
                    <dt className='text-muted-foreground'>{t('popup_label_name')}</dt>
                    <dd className='break-words font-medium'>{user.name}</dd>
                    {user.handle !== null && <dt className='text-muted-foreground'>{t('popup_label_handle')}</dt>}
                    {user.handle !== null && <dd className='break-all'>@{user.handle}</dd>}
                </dl>
            )}

            <p className='break-words text-xs text-muted-foreground'>{HINT_BY_STATE[state]()}</p>

            <div className='mt-3 flex gap-2'>
                {state !== 'logged_in' && (
                    <Button size='sm' className='flex-1' onClick={onOpenLogin}>
                        {t('popup_action_open_rank_login')}
                    </Button>
                )}
                <Button variant='outline' size='sm' className='flex-1' onClick={onRecheck} disabled={disabled}>
                    {t('popup_action_recheck')}
                </Button>
            </div>
        </Card>
    )
}
