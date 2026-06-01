import { io, Socket } from 'socket.io-client'

let socket: Socket | null = null
let authToken: string | null = null
const joinedRooms = new Set<string>()
const pendingListeners: [string, (...args: any[]) => void][] = []

export function setSocketAuthToken(token: string | null) {
  authToken = token
  if (!socket) {
    if (!token) return
    initSocket(token)
    return
  }
  socket.auth = { token }
  if (socket.connected) {
    socket.disconnect()
  }
  socket.connect()
  // re-join rooms after reconnect
  if (socket.connected && joinedRooms.size > 0) {
    joinedRooms.forEach(r => {
      try { socket?.emit('join:room', { room: r }) } catch (e) {
        console.warn('Failed to re-join room after token update:', r, e)
      }
    })
  }
}

function initSocket(token: string) {
  const url = import.meta.env.VITE_API_URL
  socket = io(url, {
    autoConnect: false,
    auth: { token }
  })

  socket.on('connect_error', (err) => {
    console.warn('Socket connect error', err?.message || err)
  })

  socket.on('connect', () => {
    joinedRooms.forEach(r => {
      try { socket?.emit('join:room', { room: r }) } catch (e) {
        console.warn('Failed to join room on reconnect:', r, e)
      }
    })
  })

  // Replay any listeners that were registered before init
  for (const [ev, cb] of pendingListeners) {
    socket.on(ev, cb)
  }
  pendingListeners.length = 0

  socket.connect()
  return socket
}

export function getSocket() {
  return socket
}

export function joinRoom(room: string) {
  joinedRooms.add(room)
  const s = socket
  if (s?.connected) s.emit('join:room', { room })
}

export function leaveRoom(room: string) {
  joinedRooms.delete(room)
  const s = socket
  if (s?.connected) {
    try { s.emit('leave:room', { room }) } catch (e) {
      console.warn('Failed to leave room:', room, e)
    }
  }
}

export function onEvent(ev: string, cb: (...args: any[]) => void) {
  if (socket) {
    socket.on(ev, cb)
  } else {
    pendingListeners.push([ev, cb])
  }
}

export function offEvent(ev: string, cb?: (...args: any[]) => void) {
  if (!socket) return
  if (cb) socket.off(ev, cb)
  else socket.removeAllListeners(ev)
}
