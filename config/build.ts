import Bun, { $, Glob } from 'bun'

import manifest from '../public/manifest.json'
import './cwd'

const outdir = './build'
const publicFolder = './public'

const contentScripts = manifest.content_scripts.flatMap((script) => script.js)
const backgroundScripts = [...(manifest.background?.service_worker ? [manifest.background.service_worker] : [])]
const entrypoints = [...contentScripts, ...backgroundScripts, 'popup/index.tsx'].map((entrypoint) => `./src/${entrypoint}`)

const htmlAssets = ['popup.html']
const ignoredAssetSuffixes = ['.png', '.css'] as const

await $`rm -rf ${outdir}`

await Bun.build({
    target: 'browser',
    entrypoints,
    outdir,
    naming: '[dir]/[name].js',
})

const glob = new Glob('**')
const globalCssFile = Bun.file(`${publicFolder}/global.css`)

if (!globalCssFile.exists()) throw new Error('global.css not found')

for await (const filename of glob.scan(publicFolder)) {
    const file = Bun.file(`${publicFolder}/${filename}`)

    if (!file.exists()) throw new Error(`File ${filename} does not exist`)

    if (filename === 'global.css') continue

    if (filename.endsWith('.html')) {
        if (!htmlAssets.includes(filename)) {
            await $`cp ${file.name} ${outdir}/${filename}`.quiet()
            continue
        }

        const fileFolder = filename.replace('.html', '')

        await $`mkdir -p ${outdir}/${fileFolder}`
        await $`cp ${file.name} ${outdir}/${fileFolder}/index.html`
        await $`bun run css -- ${globalCssFile.name} -o ${outdir}/${fileFolder}/global.css`.quiet()
        continue
    }

    if (ignoredAssetSuffixes.some((suffix) => filename.endsWith(suffix))) continue

    await $`cp ${file.name} ${outdir}`
}

await $`cp -R ${publicFolder}/icons ${outdir}`
