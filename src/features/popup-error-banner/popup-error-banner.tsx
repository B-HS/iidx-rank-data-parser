import type { FC } from 'react'
import { translateMessage } from '@shared/i18n'
import type { TranslatableMessage } from '@shared/i18n'

type PopupErrorBannerProps = {
    error: TranslatableMessage
}

export const PopupErrorBanner: FC<PopupErrorBannerProps> = ({ error }) => (
    <p role='alert' className='break-words rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive'>
        {translateMessage(error)}
    </p>
)
