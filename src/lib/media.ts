import { useEffect, useState } from 'react'
import { supabase } from './supabase'

// Photos and videos shared by the group live in the private "media" bucket.
// Each photo is made smaller on the phone before upload, to save roaming data,
// and gets a small preview next to it. Whatever has been shown once is kept in
// the phone's Cache Storage, so it still shows without signal. Videos are
// uploaded as they are and play straight from the server.
const BUCKET = 'media'
const CACHE = 'bic-media'
const keyFor = (path: string) => `/__media/${encodeURIComponent(path)}`
export const MAX_VIDEO_MB = 50 // the bucket's limit per file

/** Where the small preview of a photo is stored. */
export const thumbOf = (path: string) => path.replace(/\.\w+$/, '.thumb.jpg')

/** Scale an image down to fit in `max` pixels, as a JPEG. */
export async function shrinkImage(file: Blob, max: number, quality = 0.82): Promise<Blob> {
  const url = URL.createObjectURL(file)
  try {
    const img = new Image()
    img.src = url
    await img.decode()
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(img.naturalWidth * scale)
    canvas.height = Math.round(img.naturalHeight * scale)
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height)
    return await new Promise((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not read this image.'))), 'image/jpeg', quality))
  } finally {
    URL.revokeObjectURL(url)
  }
}

export function newPath(tripId: string, folder: string, ext: string) {
  return `${tripId}/${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
}

export async function putFile(path: string, body: Blob, contentType: string) {
  const { error } = await supabase.storage.from(BUCKET).upload(path, body, { contentType })
  if (error) throw error
}

/** Upload a photo and its preview. Returns the photo's path. */
export async function uploadImage(tripId: string, folder: string, file: Blob, max = 1600) {
  const path = newPath(tripId, folder, 'jpg')
  const [full, thumb] = await Promise.all([shrinkImage(file, max), shrinkImage(file, 480, 0.7)])
  await putFile(thumbOf(path), thumb, 'image/jpeg')
  await putFile(path, full, 'image/jpeg')
  return path
}

/** A frame from near the start of a video, as a small JPEG. Null when the phone cannot make one. */
function videoPoster(file: Blob): Promise<Blob | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    const done = (b: Blob | null) => { clearTimeout(timer); URL.revokeObjectURL(url); resolve(b) }
    const timer = setTimeout(() => done(null), 8000)
    video.muted = true
    video.playsInline = true
    video.preload = 'auto'
    video.onerror = () => done(null)
    video.onloadeddata = () => { video.currentTime = Math.min(1, (video.duration || 2) / 2) }
    video.onseeked = () => {
      const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight, 1))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(video.videoWidth * scale)
      canvas.height = Math.round(video.videoHeight * scale)
      if (!canvas.width || !canvas.height) return done(null)
      canvas.getContext('2d')!.drawImage(video, 0, 0, canvas.width, canvas.height)
      canvas.toBlob(done, 'image/jpeg', 0.7)
    }
    video.src = url
  })
}

/** Upload a video as it is, with a preview frame when one can be made. */
export async function uploadVideo(tripId: string, folder: string, file: File) {
  const ext = (file.name.split('.').pop() ?? 'mp4').toLowerCase().replace(/[^a-z0-9]/g, '') || 'mp4'
  const path = newPath(tripId, folder, ext)
  const poster = await videoPoster(file)
  if (poster) await putFile(thumbOf(path), poster, 'image/jpeg')
  await putFile(path, file, file.type || 'video/mp4')
  return { path, thumb_path: poster ? thumbOf(path) : null }
}

/** Best effort: the album row is already gone, so a file left behind is only wasted space. */
export function removeMedia(paths: (string | null)[]) {
  const list = paths.filter((p): p is string => Boolean(p))
  supabase.storage.from(BUCKET).remove(list).catch(() => {})
  if ('caches' in window) caches.open(CACHE).then((c) => list.forEach((p) => c.delete(keyFor(p)))).catch(() => {})
}

/** A link that works for an hour. With `downloadAs`, opening it saves the file under that name. */
export async function signedUrl(path: string, downloadAs?: string) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600, downloadAs ? { download: downloadAs } : undefined)
  if (error) throw error
  return data.signedUrl
}

export function useSignedUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    signedUrl(path).then((u) => { if (alive) setUrl(u) }).catch(() => {})
    return () => { alive = false; setUrl(null) }
  }, [path])
  return url
}

export async function mediaBlob(path: string) {
  const cache = 'caches' in window ? await caches.open(CACHE) : null
  const hit = await cache?.match(keyFor(path))
  if (hit) return hit.blob()
  const { data } = await supabase.storage.from(BUCKET).download(path)
  if (data) await cache?.put(keyFor(path), new Response(data, { headers: { 'content-type': data.type } })).catch(() => {})
  return data
}

/** A URL to show a stored file in an <img>, or null while loading or when it is not available. */
export function useMediaUrl(path: string | null | undefined) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!path) return
    let alive = true
    let made: string | null = null
    mediaBlob(path).then((b) => {
      if (!alive || !b) return
      made = URL.createObjectURL(b)
      setUrl(made)
    }).catch(() => {})
    return () => {
      alive = false
      if (made) URL.revokeObjectURL(made)
      setUrl(null)
    }
  }, [path])
  return url
}
