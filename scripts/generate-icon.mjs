import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ICON_SIZES = [16, 32, 48, 128]
const BACKGROUND = [17, 17, 23, 255]
const FOREGROUND = [56, 189, 248, 255]
const ACCENT = [244, 114, 182, 255]

const crcTable = Array.from({ length: 256 }, (_, index) => {
    let value = index

    for (let bit = 0; bit < 8; bit += 1) {
        value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1
    }

    return value >>> 0
})

const crc32 = (buffer) => {
    let crc = 0xffffffff

    for (const byte of buffer) {
        crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8)
    }

    return (crc ^ 0xffffffff) >>> 0
}

const chunk = (type, data) => {
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const typeBuffer = Buffer.from(type, 'ascii')
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])))

    return Buffer.concat([length, typeBuffer, data, crc])
}

const encodePng = (size, pixels) => {
    const header = Buffer.alloc(13)
    header.writeUInt32BE(size, 0)
    header.writeUInt32BE(size, 4)
    header[8] = 8
    header[9] = 6

    const raw = Buffer.alloc((size * 4 + 1) * size)
    let offset = 0

    for (let y = 0; y < size; y += 1) {
        raw[offset] = 0
        offset += 1
        for (let x = 0; x < size; x += 1) {
            const index = (y * size + x) * 4
            raw[offset] = pixels[index]
            raw[offset + 1] = pixels[index + 1]
            raw[offset + 2] = pixels[index + 2]
            raw[offset + 3] = pixels[index + 3]
            offset += 4
        }
    }

    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', header),
        chunk('IDAT', deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ])
}

const mix = (base, overlay, ratio) => base.map((channel, index) => Math.round(channel + (overlay[index] - channel) * ratio))

const renderIcon = (size) => {
    const pixels = Buffer.alloc(size * size * 4)
    const center = (size - 1) / 2
    const outerRadius = size * 0.46
    const ringRadius = size * 0.3
    const barWidth = Math.max(1, size * 0.1)

    for (let y = 0; y < size; y += 1) {
        for (let x = 0; x < size; x += 1) {
            const dx = x - center
            const dy = y - center
            const distance = Math.sqrt(dx * dx + dy * dy)
            const index = (y * size + x) * 4
            const angle = Math.atan2(dy, dx)
            const inDisc = distance <= outerRadius
            const inRing = distance <= ringRadius
            const isBar = Math.abs(dy) <= barWidth / 2 && distance <= outerRadius * 0.94
            const isSlash = Math.abs(dx + dy) <= barWidth / 1.6 && distance <= outerRadius * 0.94

            let color = BACKGROUND
            let alpha = inDisc ? 255 : 0

            if (inRing) {
                color = mix(BACKGROUND, FOREGROUND, 0.35 + 0.35 * Math.cos(angle * 2))
            }

            if (isBar) {
                color = mix(color, ACCENT, 0.95)
                alpha = 255
            }

            if (isSlash) {
                color = mix(color, FOREGROUND, 0.95)
                alpha = 255
            }

            pixels[index] = color[0]
            pixels[index + 1] = color[1]
            pixels[index + 2] = color[2]
            pixels[index + 3] = alpha
        }
    }

    return pixels
}

const outputDirectory = resolve(dirname(fileURLToPath(import.meta.url)), '../public/icons')

mkdirSync(outputDirectory, { recursive: true })

for (const size of ICON_SIZES) {
    const png = encodePng(size, renderIcon(size))
    writeFileSync(resolve(outputDirectory, `icon${size}.png`), png)
}

console.log(`generated ${ICON_SIZES.length} icons in ${outputDirectory}`)
