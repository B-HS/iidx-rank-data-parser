import Bun, { $ } from 'bun'
import { parseArgs } from 'util'
import { watch } from 'fs'
import type { FSWatcher } from 'fs'

import './cwd'

const {
    values: { dir },
} = parseArgs({
    args: Bun.argv,
    strict: true,
    allowPositionals: true,
    options: {
        dir: {
            type: 'string',
        },
    },
})

const directoriesToWatch = dir?.split(',').map((directory) => `./${directory}`) ?? []

const runBuild = async () => $`bun run config/build.ts`
await runBuild()

const watchers: FSWatcher[] = []

for (const directory of directoriesToWatch) {
    const watcher = watch(directory, { recursive: true }, async () => {
        await runBuild()
        console.log(`[iidx-data-parser] rebuilt after change in ${directory}`)
    })

    watchers.push(watcher)
}

process.on('SIGINT', () => {
    for (const watcher of watchers) {
        watcher.close()
    }

    process.exit(0)
})
