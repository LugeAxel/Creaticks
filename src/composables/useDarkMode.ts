import { ref, watch, onMounted } from 'vue'

const isDark = ref(false)

export function useDarkMode() {
  onMounted(() => {
    const stored = localStorage.getItem('creaticks-theme')
    if (stored === 'dark') {
      isDark.value = true
      document.documentElement.classList.add('dark')
    } else if (stored === 'light') {
      isDark.value = false
      document.documentElement.classList.remove('dark')
    } else {
      const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
      isDark.value = prefersDark
      if (prefersDark) document.documentElement.classList.add('dark')
    }
  })

  const toggle = () => {
    isDark.value = !isDark.value
    if (isDark.value) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('creaticks-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('creaticks-theme', 'light')
    }
  }

  const setDark = (value: boolean) => {
    isDark.value = value
    if (value) {
      document.documentElement.classList.add('dark')
      localStorage.setItem('creaticks-theme', 'dark')
    } else {
      document.documentElement.classList.remove('dark')
      localStorage.setItem('creaticks-theme', 'light')
    }
  }

  return { isDark, toggle, setDark }
}
