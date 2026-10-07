import type { FC } from 'react'
import { Badge } from '@ui/badge'
import { Button } from '@ui/button'
import { Card } from '@ui/card'
import { formatDateTime, t, translateMessage } from '@shared/i18n'
import type { Overview } from '@shared/messages'

type EamusementLoginCardProps = {
    login: Overview['login']
    disabled: boolean
    onCheck: () => void
}

const getLoginState = (login: Overview['login']) => {
    if (login === null) return 'unchecked'
    if (login.error !== null) return 'check_failed'

    return login.isLoggedIn ? 'logged_in' : 'logged_out'
}

const BADGE_BY_STATE = {
    unchecked: { tone: 'neutral', label: () => t('popup_status_unchecked') },
    check_failed: { tone: 'warning', label: () => t('popup_status_check_failed') },
    logged_in: { tone: 'success', label: () => t('popup_status_logged_in') },
    logged_out: { tone: 'danger', label: () => t('popup_status_logged_out') },
} as const

const HINT_BY_STATE = {
    unchecked: () => t('popup_eamusement_hint_unchecked'),
    check_failed: () => t('popup_eamusement_hint_failed'),
    logged_out: () => t('popup_eamusement_hint_logged_out'),
} as const

export const EamusementLoginCard: FC<EamusementLoginCardProps> = ({ login, disabled, onCheck }) => {
    const state = getLoginState(login)
    const badge = BADGE_BY_STATE[state]

    return (
        <Card title={t('popup_eamusement_title')} badge={<Badge tone={badge.tone}>{badge.label()}</Badge>}>
            {state === 'logged_in' ? (
                <dl className='grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-xs'>
                    <dt className='text-muted-foreground'>DJ NAME</dt>
                    <dd className='break-words font-medium'>{login?.djName ?? '-'}</dd>
                    <dt className='text-muted-foreground'>{t('popup_label_community')}</dt>
                    <dd className='break-words'>{login?.communityNickname ?? '-'}</dd>
                    <dt className='text-muted-foreground'>{t('popup_label_checked_at')}</dt>
                    <dd>{formatDateTime(login?.checkedAt ?? null)}</dd>
                </dl>
            ) : (
                <p className='break-words text-xs text-muted-foreground'>{HINT_BY_STATE[state]()}</p>
            )}

            {login !== null && login.error !== null && (
                <p className='mt-2 break-words text-[11px] text-destructive'>{translateMessage(login.error)}</p>
            )}

            <Button variant='outline' size='sm' className='mt-3 w-full' onClick={onCheck} disabled={disabled}>
                {t('popup_action_check_login')}
            </Button>
        </Card>
    )
}
