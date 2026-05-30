import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let authToken: string | null = null
const joinedRooms = new Set<string>()

export function setSocketAuthToken(token: string | null) {
  authToken = token
  if (!socket) return
  socket.auth = { token }
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()
}

export function getSocket() {
  if (socket) return socket
  const url = import.meta.env.VITE_API_URL
  socket = io(url, {
    autoConnect: false,
    auth: { token: authToken }
  })

  socket.on('connect_error', (err) => {
    console.warn('Socket connect error', err?.message || err)
  })

  socket.on('connect', () => {
    // Re-join previously joined rooms after reconnect
    joinedRooms.forEach(r => {
      try { socket?.emit('join:room', { room: r }) } catch (e) {}
    })
  })

  socket.connect()
  return socket
}

export function joinRoom(room: string) {
  joinedRooms.add(room)
  const s = getSocket()
  if (s.connected) s.emit('join:room', { room })
}

export function leaveRoom(room: string) {
  joinedRooms.delete(room)
  const s = getSocket()
  if (s.connected) s.emit('leave:room', { room })
}

export function onEvent(ev: string, cb: (...args: any[]) => void) {
  const s = getSocket()
  s.on(ev, cb)
}

export function offEvent(ev: string, cb?: (...args: any[]) => void) {
  const s = getSocket()
  if (cb) s.off(ev, cb)
  else s.removeAllListeners(ev)
}
