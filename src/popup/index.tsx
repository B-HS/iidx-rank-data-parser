import { createRoot } from 'react-dom/client'
import { Popup } from '@widgets/popup'

const container = document.getElementById('root')

if (container !== null) {
    createRoot(container).render(<Popup />)
}
