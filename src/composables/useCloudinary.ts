import axios from 'axios'

export function useCloudinary() {
  const upload = async (file: File, token: string, folder?: string) => {
    const formData = new FormData()
    formData.append('file', file)
    if (folder) formData.append('folder', folder)

    try {
      const { data } = await axios.post('/api/upload', formData, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'multipart/form-data'
        }
      })
      return data as { url: string; publicId: string }
    } catch (err: any) {
      const message = err?.response?.data?.error || 'Gagal mengunggah gambar'
      throw new Error(message)
    }
  }

  return { upload }
}
