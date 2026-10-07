import { useEffect, useState } from 'react'
import type { FC } from 'react'
import { Button } from '@ui/button'
import { CollectionProgressCard } from '@features/collection-progress-card/collection-progress-card'
import { CollectionSettingsCard } from '@features/collection-settings-card/collection-settings-card'
import { EamusementLoginCard } from '@features/eamusement-login-card/eamusement-login-card'
import { PopupErrorBanner } from '@features/popup-error-banner/popup-error-banner'
import { RankAccountCard } from '@features/rank-account-card/rank-account-card'
import { RankSyncCard } from '@features/rank-sync-card/rank-sync-card'
import { SavedDatasetCard } from '@features/saved-dataset-card/saved-dataset-card'
import { t } from '@shared/i18n'
import type { TranslatableMessage } from '@shared/i18n'
import { BackgroundResponseSchema } from '@shared/messages'
import type { BackgroundRequest, BackgroundResponse, Download, Overview } from '@shared/messages'
import { RANK_IMPORT_STYLE } from '@shared/rank-schema'
import { DEFAULT_SETTINGS } from '@shared/schema'
import type { Settings } from '@shared/schema'

const BACKGROUND_RESPONSE_TIMEOUT_MS = 40_000
const DOWNLOAD_URL_REVOKE_DELAY_MS = 10_000
const STORAGE_KEY_PREFIX = 'iidx:'
const GET_OVERVIEW_REQUEST = { type: 'GET_OVERVIEW' } as const satisfies BackgroundRequest
const CHECK_RANK_SESSION_REQUEST = { type: 'CHECK_RANK_SESSION' } as const satisfies BackgroundRequest

type SendData = Extract<BackgroundResponse, { ok: true }>['data']

type SendResult = { ok: true; data: SendData } | { ok: false; error: TranslatableMessage }

const UNREACHABLE_RESULT = { ok: false, error: { key: 'popup_error_background_unreachable', params: [] } } as const satisfies SendResult
const INVALID_RESULT = { ok: false, error: { key: 'popup_error_invalid_response', params: [] } } as const satisfies SendResult

const send = async (request: BackgroundRequest): Promise<SendResult> => {
    let timer: number | undefined
    const timeout = new Promise<undefined>((resolve) => {
        timer = window.setTimeout(resolve, BACKGROUND_RESPONSE_TIMEOUT_MS)
    })

    try {
        const raw: unknown = await Promise.race([chrome.runtime.sendMessage(request), timeout])
        if (raw === undefined) return UNREACHABLE_RESULT

        const parsed = BackgroundResponseSchema.safeParse(raw)
        return parsed.success ? parsed.data : INVALID_RESULT
    } catch {
        return UNREACHABLE_RESULT
    } finally {
        clearTimeout(timer)
    }
}

const overviewOf = (data: SendData) => (data !== null && 'collection' in data ? data : null)

const downloadOf = (data: SendData) => (data !== null && 'download' in data ? data.download : null)

const triggerDownload = ({ filename, content }: Download['download']) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_URL_REVOKE_DELAY_MS)
}

const getLockReason = (overview: Overview) => {
    if (overview.collection.status === 'running') return t('popup_reason_collecting')
    if (overview.rank.isSyncing) return t('popup_reason_syncing')

    return null
}

const getStartBlockReason = (overview: Overview, settings: Settings) => {
    if (overview.collection.status === 'running') return null
    if (overview.rank.isSyncing) return t('popup_reason_syncing')
    if (overview.login === null) return t('popup_reason_login_unchecked')
    if (overview.login.error !== null) return t('popup_reason_login_failed')
    if (!overview.login.isLoggedIn) return t('popup_reason_login_required')
    if (settings.levels.length === 0) return t('popup_reason_no_levels')

    return null
}

const getSyncBlockReason = (overview: Overview) => {
    if (overview.collection.status === 'running') return t('popup_reason_collecting')
    if (overview.dataset === null) return t('popup_reason_no_dataset')
    if (overview.dataset.style !== RANK_IMPORT_STYLE) return t('rank_reason_dp_unsupported')

    return null
}

const loadOverview = async (request: BackgroundRequest) => {
    const response = await send(request)

    return response.ok ? { overview: overviewOf(response.data), error: null } : { overview: null, error: response.error }
}

export const Popup: FC = () => {
    const [overview, setOverview] = useState<Overview | null>(null)
    const [error, setError] = useState<TranslatableMessage | null>(null)
    const [isBusy, setIsBusy] = useState(false)

    const run = async (request: BackgroundRequest) => {
        setIsBusy(true)
        setError(null)

        try {
            const response = await send(request)

            if (!response.ok) {
                setError(response.error)
                return
            }

            const download = downloadOf(response.data)
            if (download !== null) {
                triggerDownload(download)
                return
            }

            const next = overviewOf(response.data) ?? (await loadOverview(GET_OVERVIEW_REQUEST)).overview
            if (next !== null) setOverview(next)
        } finally {
            setIsBusy(false)
        }
    }

    const settings = overview?.settings ?? DEFAULT_SETTINGS
    const isCollecting = overview?.collection.status === 'running'
    const lockReason = overview === null ? null : getLockReason(overview)
    const startBlockReason = overview === null ? null : getStartBlockReason(overview, settings)
    const isLocked = isBusy || lockReason !== null

    useEffect(() => {
        let isActive = true

        const load = async (request: BackgroundRequest) => {
            const result = await loadOverview(request)
            if (!isActive) return

            if (result.overview !== null) setOverview(result.overview)
            if (result.error !== null) setError(result.error)
        }

        const handleStorageChange = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'local') return
            if (!Object.keys(changes).some((key) => key.startsWith(STORAGE_KEY_PREFIX))) return

            void load(GET_OVERVIEW_REQUEST)
        }

        const startup = async () => {
            await load(GET_OVERVIEW_REQUEST)
            await load(CHECK_RANK_SESSION_REQUEST)
        }

        void startup()
        chrome.storage.onChanged.addListener(handleStorageChange)

        return () => {
            isActive = false
            chrome.storage.onChanged.removeListener(handleStorageChange)
        }
    }, [])

    return (
        <main className='flex w-[420px] min-w-0 flex-col gap-3 p-3'>
            <header>
                <h1 className='text-sm font-semibold'>{t('extName')}</h1>
                <p className='break-words text-[11px] text-muted-foreground'>{t('popup_subtitle')}</p>
            </header>

            {error !== null && <PopupErrorBanner error={error} />}

            {overview === null && error === null && (
                <p role='status' className='text-xs text-muted-foreground'>
                    {t('popup_loading')}
                </p>
            )}

            {overview !== null && (
                <>
                    <EamusementLoginCard login={overview.login} disabled={isLocked} onCheck={() => void run({ type: 'CHECK_LOGIN' })} />

                    <RankAccountCard
                        rank={overview.rank}
                        disabled={isBusy}
                        onOpenLogin={() => void run({ type: 'OPEN_RANK_LOGIN' })}
                        onRecheck={() => void run({ type: 'CHECK_RANK_SESSION' })}
                    />

                    <CollectionSettingsCard
                        settings={settings}
                        disabled={isLocked}
                        disabledReason={lockReason}
                        onChange={(next) => void run({ type: 'UPDATE_SETTINGS', settings: next })}
                    />

                    <div>
                        <Button
                            className='w-full'
                            disabled={isLocked || startBlockReason !== null}
                            onClick={() => void run({ type: 'START_COLLECTION', settings })}>
                            {isCollecting ? t('popup_action_collecting') : t('popup_action_start')}
                        </Button>
                        {startBlockReason !== null && <p className='mt-1 break-words text-[11px] text-muted-foreground'>{startBlockReason}</p>}
                    </div>

                    <CollectionProgressCard collection={overview.collection} onCancel={() => void run({ type: 'CANCEL_COLLECTION' })} />

                    <SavedDatasetCard
                        dataset={overview.dataset}
                        disabled={isLocked}
                        disabledReason={lockReason}
                        onExport={() => void run({ type: 'EXPORT_DATASET' })}
                        onExportRank={() => void run({ type: 'EXPORT_RANK_IMPORT' })}
                        onClear={() => void run({ type: 'CLEAR_DATA' })}
                    />

                    <RankSyncCard
                        rank={overview.rank}
                        blockReason={isBusy ? null : getSyncBlockReason(overview)}
                        onSync={() => void run({ type: 'SYNC_RANK' })}
                    />

                    <p className='break-words text-[11px] leading-relaxed text-muted-foreground'>{t('popup_footer_note')}</p>
                </>
            )}
        </main>
    )
}
