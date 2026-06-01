import { createApp } from 'vue'
import App from '@/App.vue'
import router from '@/router'
import '@/style.css'

const app = createApp(App)
app.use(router)
app.mount('#app')

// Register a minimal service worker to cache navigation and assets for offline/fast loads
// if ('serviceWorker' in navigator) {
// 	window.addEventListener('load', () => {
// 		navigator.serviceWorker.register('/sw.js')
// 			.then(reg => console.log('[SW] registered', reg.scope))
// 			.catch(err => console.error('[SW] registration failed', err))
// 	})
// }
