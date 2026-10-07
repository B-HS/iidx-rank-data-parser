import { createRoot } from 'react-dom/client'
import { Popup } from '@widgets/popup/popup'
import { t } from '@shared/i18n'

const container = document.getElementById('root')

document.documentElement.lang = chrome.i18n.getUILanguage()
document.title = t('extName')

if (container !== null) {
    createRoot(container).render(<Popup />)
}
