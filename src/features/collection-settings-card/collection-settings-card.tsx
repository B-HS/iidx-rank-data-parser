import { useId } from 'react'
import type { FC } from 'react'
import { Button } from '@ui/button'
import { Card } from '@ui/card'
import { DELAY_PROFILES, LEVEL_MAX, LEVEL_MIN } from '@shared/constants'
import { DELAY_PROFILE_NAMES, PLAY_STYLES } from '@shared/domain'
import { t } from '@shared/i18n'
import type { Settings } from '@shared/schema'

type CollectionSettingsCardProps = {
    settings: Settings
    disabled: boolean
    disabledReason: string | null
    onChange: (next: Settings) => void
}

const LEVELS = Array.from({ length: LEVEL_MAX - LEVEL_MIN + 1 }, (_, index) => LEVEL_MIN + index)
const STYLE_LABEL = { 0: 'SP', 1: 'DP' } as const

export const CollectionSettingsCard: FC<CollectionSettingsCardProps> = ({ settings, disabled, disabledReason, onChange }) => {
    const styleLabelId = useId()
    const levelsLabelId = useId()
    const delayLabelId = useId()

    const toggleLevel = (level: number) => {
        const nextLevels = settings.levels.includes(level)
            ? settings.levels.filter((value) => value !== level)
            : [...settings.levels, level].toSorted((a, b) => a - b)

        if (nextLevels.length === 0) return

        onChange({ ...settings, levels: nextLevels })
    }

    return (
        <Card title={t('popup_settings_title')}>
            <div className='mb-3 flex items-center gap-2'>
                <span id={styleLabelId} className='w-20 shrink-0 text-xs text-muted-foreground'>
                    {t('popup_settings_style')}
                </span>
                <div role='group' aria-labelledby={styleLabelId} className='flex gap-1'>
                    {PLAY_STYLES.map((style) => (
                        <Button
                            key={style}
                            size='sm'
                            aria-pressed={settings.style === style}
                            variant={settings.style === style ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => onChange({ ...settings, style })}>
                            {STYLE_LABEL[style]}
                        </Button>
                    ))}
                </div>
            </div>

            <div className='mb-3'>
                <span id={levelsLabelId} className='mb-1 block text-xs text-muted-foreground'>
                    {t('popup_settings_levels')}
                </span>
                <div role='group' aria-labelledby={levelsLabelId} className='grid grid-cols-6 gap-1'>
                    {LEVELS.map((level) => (
                        <Button
                            key={level}
                            size='sm'
                            className='px-0'
                            aria-pressed={settings.levels.includes(level)}
                            variant={settings.levels.includes(level) ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => toggleLevel(level)}>
                            {level}
                        </Button>
                    ))}
                </div>
            </div>

            <div className='flex items-center gap-2'>
                <span id={delayLabelId} className='w-20 shrink-0 text-xs text-muted-foreground'>
                    {t('popup_settings_delay')}
                </span>
                <div role='group' aria-labelledby={delayLabelId} className='flex min-w-0 flex-1 gap-1'>
                    {DELAY_PROFILE_NAMES.map((name) => (
                        <Button
                            key={name}
                            size='sm'
                            className='min-w-0 flex-1 px-1'
                            aria-pressed={settings.delayProfile === name}
                            variant={settings.delayProfile === name ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => onChange({ ...settings, delayProfile: name })}>
                            {t(DELAY_PROFILES[name].labelKey)}
                        </Button>
                    ))}
                </div>
            </div>

            {disabledReason !== null && <p className='mt-3 break-words text-[11px] text-muted-foreground'>{disabledReason}</p>}

            <p className='mt-3 break-words text-[11px] leading-relaxed text-muted-foreground'>{t('popup_settings_note_scope')}</p>
            {settings.style === 1 && (
                <p className='mt-1 break-words text-[11px] font-medium text-amber-700 dark:text-amber-400'>{t('popup_settings_warning_dp')}</p>
            )}
        </Card>
    )
}
