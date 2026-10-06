import { useCallback, useEffect, useState } from 'react'
import { Button } from '@ui/button'
import { Badge } from '@ui/badge'
import { Input } from '@ui/input'
import { Progress } from '@ui/progress'
import { DELAY_PROFILES, LEVEL_MAX, LEVEL_MIN } from '@shared/constants'
import { DEFAULT_SETTINGS, RADAR_AXES } from '@shared/schema'
import type { CollectionState, Dataset, LoginState, Settings } from '@shared/schema'
import type { BackgroundRequest, BackgroundResponse, Overview } from '@shared/messages'

type DownloadTarget = { filename: string; content: string }

const send = (message: BackgroundRequest): Promise<BackgroundResponse> => chrome.runtime.sendMessage(message) as Promise<BackgroundResponse>

const triggerDownload = ({ filename, content }: DownloadTarget) => {
    const url = URL.createObjectURL(new Blob([content], { type: 'application/json' }))
    const anchor = document.createElement('a')

    anchor.href = url
    anchor.download = filename
    anchor.click()
    setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

const STATUS_TONE = {
    idle: 'neutral',
    running: 'warning',
    completed: 'success',
    failed: 'danger',
    cancelled: 'neutral',
} as const

const STATUS_LABEL = {
    idle: '대기',
    running: '진행 중',
    completed: '완료',
    failed: '실패',
    cancelled: '중단',
} as const

const LEVELS = Array.from({ length: LEVEL_MAX - LEVEL_MIN + 1 }, (_, index) => LEVEL_MIN + index)

const formatDateTime = (iso: string | null) => {
    if (iso === null) return '-'

    return new Intl.DateTimeFormat('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(iso))
}

const formatRadarValue = (value: number | null) => (value === null ? '-' : value.toFixed(2))

const LoginCard = ({ login, onRefresh, busy }: { login: LoginState | null; onRefresh: () => void; busy: boolean }) => {
    const isLoggedIn = login?.isLoggedIn === true

    return (
        <section className='rounded-lg border border-border bg-card p-3'>
            <header className='mb-2 flex items-center justify-between'>
                <h2 className='text-xs font-semibold text-muted-foreground'>e-amusement 로그인</h2>
                <Badge tone={isLoggedIn ? 'success' : 'danger'}>{isLoggedIn ? '로그인됨' : '비로그인'}</Badge>
            </header>

            {isLoggedIn ? (
                <dl className='grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs'>
                    <dt className='text-muted-foreground'>DJ NAME</dt>
                    <dd className='font-medium'>{login?.djName ?? '-'}</dd>
                    <dt className='text-muted-foreground'>커뮤니티</dt>
                    <dd className='truncate'>{login?.communityNickname ?? '-'}</dd>
                    <dt className='text-muted-foreground'>확인 시각</dt>
                    <dd>{formatDateTime(login?.checkedAt ?? null)}</dd>
                </dl>
            ) : (
                <p className='text-xs text-muted-foreground'>
                    로그인하지 않으면 익스텐션이 비활성화됩니다. 브라우저에서 e-amusement에 로그인한 뒤 새로고침을 눌러 주세요.
                </p>
            )}

            <Button variant='outline' size='sm' className='mt-3 w-full' onClick={onRefresh} disabled={busy}>
                로그인 상태 새로고침
            </Button>
        </section>
    )
}

const SettingsCard = ({ settings, disabled, onChange }: { settings: Settings; disabled: boolean; onChange: (next: Settings) => void }) => {
    const toggleLevel = (level: number) => {
        const nextLevels = settings.levels.includes(level)
            ? settings.levels.filter((value) => value !== level)
            : [...settings.levels, level].toSorted((a, b) => a - b)
        onChange({ ...settings, levels: nextLevels })
    }

    return (
        <section className='rounded-lg border border-border bg-card p-3'>
            <h2 className='mb-2 text-xs font-semibold text-muted-foreground'>수집 설정</h2>

            <div className='mb-3 flex items-center gap-2'>
                <span className='w-16 text-xs text-muted-foreground'>스타일</span>
                <div className='flex gap-1'>
                    {([0, 1] as const).map((style) => (
                        <Button
                            key={style}
                            size='sm'
                            variant={settings.style === style ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => onChange({ ...settings, style })}>
                            {style === 0 ? 'SP' : 'DP'}
                        </Button>
                    ))}
                </div>
            </div>

            <div className='mb-3'>
                <span className='mb-1 block text-xs text-muted-foreground'>레벨 (12레벨 기준, 복수 선택)</span>
                <div className='grid grid-cols-6 gap-1'>
                    {LEVELS.map((level) => (
                        <Button
                            key={level}
                            size='sm'
                            className='px-0'
                            variant={settings.levels.includes(level) ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => toggleLevel(level)}>
                            {level}
                        </Button>
                    ))}
                </div>
            </div>

            <div className='flex items-center gap-2'>
                <span className='w-16 text-xs text-muted-foreground'>요청 간격</span>
                <div className='flex flex-1 gap-1'>
                    {Object.entries(DELAY_PROFILES).map(([key, profile]) => (
                        <Button
                            key={key}
                            size='sm'
                            className='flex-1 px-0'
                            variant={settings.delayProfile === key ? 'default' : 'outline'}
                            disabled={disabled}
                            onClick={() => onChange({ ...settings, delayProfile: key as Settings['delayProfile'] })}>
                            {profile.label}
                        </Button>
                    ))}
                </div>
            </div>
        </section>
    )
}

const ProgressCard = ({ collection, onCancel }: { collection: CollectionState; onCancel: () => void }) => {
    const isRunning = collection.status === 'running'

    return (
        <section className='rounded-lg border border-border bg-card p-3'>
            <header className='mb-2 flex items-center justify-between'>
                <h2 className='text-xs font-semibold text-muted-foreground'>수집 진행</h2>
                <Badge tone={STATUS_TONE[collection.status]}>{STATUS_LABEL[collection.status]}</Badge>
            </header>

            <Progress value={collection.percent} />

            <p className='mt-2 text-xs'>{collection.message === '' ? '아직 수집한 기록이 없습니다.' : collection.message}</p>

            <dl className='mt-2 grid grid-cols-3 gap-2 text-[11px] text-muted-foreground'>
                <div>
                    <dt>차트</dt>
                    <dd className='text-foreground'>{collection.chartCount}</dd>
                </div>
                <div>
                    <dt>페이지</dt>
                    <dd className='text-foreground'>{collection.pagesFetched}</dd>
                </div>
                <div>
                    <dt>시작</dt>
                    <dd className='text-foreground'>{formatDateTime(collection.startedAt)}</dd>
                </div>
            </dl>

            {collection.warnings.length > 0 && (
                <ul className='mt-2 space-y-1 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[11px] text-amber-700 dark:text-amber-400'>
                    {collection.warnings.slice(0, 4).map((warning) => (
                        <li key={warning}>{warning}</li>
                    ))}
                </ul>
            )}

            {isRunning && (
                <Button variant='destructive' size='sm' className='mt-3 w-full' onClick={onCancel}>
                    수집 중단
                </Button>
            )}
        </section>
    )
}

const DatasetCard = ({
    dataset,
    onExport,
    onExportRank,
    onClear,
    busy,
}: {
    dataset: Overview['dataset']
    onExport: () => void
    onExportRank: () => void
    onClear: () => void
    busy: boolean
}) => (
    <section className='rounded-lg border border-border bg-card p-3'>
        <header className='mb-2 flex items-center justify-between'>
            <h2 className='text-xs font-semibold text-muted-foreground'>저장된 데이터</h2>
            {dataset !== null && (
                <Badge tone={dataset.status === 'complete' ? 'success' : dataset.status === 'partial' ? 'warning' : 'neutral'}>
                    {dataset.status}
                </Badge>
            )}
        </header>

        {dataset === null ? (
            <p className='text-xs text-muted-foreground'>저장된 데이터가 없습니다. 수집을 실행해 주세요.</p>
        ) : (
            <>
                <dl className='grid grid-cols-2 gap-2 text-xs'>
                    <div>
                        <dt className='text-muted-foreground'>차트 수</dt>
                        <dd className='font-medium'>{dataset.chartCount}</dd>
                    </div>
                    <div>
                        <dt className='text-muted-foreground'>DJ NAME</dt>
                        <dd className='truncate font-medium'>{dataset.djName ?? '-'}</dd>
                    </div>
                    <div className='col-span-2'>
                        <dt className='text-muted-foreground'>생성 시각</dt>
                        <dd>{formatDateTime(dataset.generatedAt)}</dd>
                    </div>
                </dl>

                {dataset.notesRadar !== null && (
                    <ul className='mt-3 grid grid-cols-3 gap-2 text-[11px]'>
                        {RADAR_AXES.map((axis) => (
                            <li key={axis} className='rounded border border-border px-2 py-1'>
                                <span className='block text-muted-foreground'>{axis}</span>
                                <span className='font-medium'>{formatRadarValue(dataset.notesRadar?.values[axis] ?? null)}</span>
                            </li>
                        ))}
                    </ul>
                )}

                <div className='mt-3 flex gap-2'>
                    <Button size='sm' className='flex-1' onClick={onExport} disabled={busy}>
                        JSON 내보내기
                    </Button>
                    <Button size='sm' variant='outline' className='flex-1' onClick={onExportRank} disabled={busy}>
                        iidx-rank용
                    </Button>
                </div>
                <Button size='sm' variant='ghost' className='mt-2 w-full text-destructive' onClick={onClear} disabled={busy}>
                    저장 데이터 삭제
                </Button>
            </>
        )}
    </section>
)

export const Popup = () => {
    const [overview, setOverview] = useState<Overview | null>(null)
    const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS)
    const [error, setError] = useState<string | null>(null)
    const [busy, setBusy] = useState(false)

    const refresh = useCallback(async () => {
        const response = await send({ type: 'GET_OVERVIEW' })

        if (!response.ok) {
            setError(response.error)
            return
        }

        const data = response.data
        if (data !== null && 'collection' in data) {
            setOverview(data)
            setSettings(data.settings)
        }
    }, [])

    useEffect(() => {
        void refresh()

        const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
            if (area !== 'local') return
            if (!Object.keys(changes).some((key) => key.startsWith('iidx:'))) return
            void refresh()
        }

        chrome.storage.onChanged.addListener(listener)

        return () => chrome.storage.onChanged.removeListener(listener)
    }, [refresh])

    const run = async (message: BackgroundRequest) => {
        setBusy(true)
        setError(null)

        try {
            const response = await send(message)

            if (!response.ok) {
                setError(response.error)
                return
            }

            const data = response.data
            if (data !== null && 'download' in data) {
                triggerDownload(data.download)
                return
            }

            if (data !== null && 'collection' in data) {
                setOverview(data)
                setSettings(data.settings)
                return
            }

            await refresh()
        } finally {
            setBusy(false)
        }
    }

    const isLoggedIn = overview?.login?.isLoggedIn === true
    const isRunning = overview?.collection.status === 'running'

    return (
        <section className='flex w-[420px] flex-col gap-3 p-3'>
            <header className='flex items-center justify-between'>
                <div>
                    <h1 className='text-sm font-semibold'>IIDX Data Parser</h1>
                    <p className='text-[11px] text-muted-foreground'>beatmania IIDX 34 · e-amusement 데이터 수집</p>
                </div>
                <Button size='sm' variant='outline' onClick={() => void run({ type: 'CHECK_LOGIN' })} disabled={busy || isRunning}>
                    로그인 확인
                </Button>
            </header>

            {error !== null && <p className='rounded border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive'>{error}</p>}

            <LoginCard login={overview?.login ?? null} busy={busy || isRunning} onRefresh={() => void run({ type: 'CHECK_LOGIN' })} />

            <SettingsCard
                settings={settings}
                disabled={busy || isRunning}
                onChange={(next) => void run({ type: 'UPDATE_SETTINGS', settings: next })}
            />

            <Button
                disabled={!isLoggedIn || busy || isRunning || settings.levels.length === 0}
                onClick={() => void run({ type: 'START_COLLECTION', settings })}>
                {isRunning ? '수집 중...' : '데이터 수집 시작'}
            </Button>

            {overview !== null && <ProgressCard collection={overview.collection} onCancel={() => void run({ type: 'CANCEL_COLLECTION' })} />}

            <DatasetCard
                dataset={overview?.dataset ?? null}
                busy={busy || isRunning}
                onExport={() => void run({ type: 'EXPORT_DATASET' })}
                onExportRank={() => void run({ type: 'EXPORT_RANK_IMPORT' })}
                onClear={() => void run({ type: 'CLEAR_DATA' })}
            />

            <p className='text-[11px] leading-relaxed text-muted-foreground'>
                수집은 열린 e-agate 탭에서 순차 요청으로 진행됩니다. 데이터는 브라우저에만 저장되며 JSON 파일로 내보내 iidx-rank에 가져올 수 있습니다.
            </p>
        </section>
    )
}
