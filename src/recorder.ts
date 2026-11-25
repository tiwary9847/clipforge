// Screen + webcam recording in the browser, dropped straight onto the timeline.
import { engine } from './engine'
import { addAsset, addClipsBatch, baseClip, clipEnd, getState } from './store'

export type RecMode = 'screen' | 'camera' | 'both'

const MIMES = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm']
export const pickMime = () => MIMES.find((m) => typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(m)) ?? ''

export const canRecordScreen = () => !!navigator.mediaDevices?.getDisplayMedia
export const canRecordCamera = () => !!navigator.mediaDevices?.getUserMedia

export interface Recording {
  camStream: MediaStream | null
  stop(): Promise<string>
  cancel(): void
}

function record(stream: MediaStream) {
  const mime = pickMime()
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined)
  const chunks: Blob[] = []
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  const done = new Promise<Blob>((res) => (rec.onstop = () => res(new Blob(chunks, { type: rec.mimeType || mime || 'video/webm' }))))
  rec.start(1000)
  return { rec, done }
}

export async function startRecording(mode: RecMode, mic: boolean, systemAudio: boolean, onEnded: () => void): Promise<Recording> {
  let screen: MediaStream | null = null
  let cam: MediaStream | null = null
  let micStream: MediaStream | null = null
  const stopAll = () => [screen, cam, micStream].forEach((s) => s?.getTracks().forEach((t) => t.stop()))
  try {
    if (mode !== 'camera') {
      screen = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: systemAudio })
      screen.getVideoTracks()[0].addEventListener('ended', onEnded) // user pressed the browser's "Stop sharing"
    }
    if (mode !== 'screen') cam = await navigator.mediaDevices.getUserMedia({ video: { width: 1280, height: 720 }, audio: mode === 'camera' && mic })
    if (mic && mode !== 'camera') micStream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
  } catch (e) {
    stopAll()
    const n = (e as Error).name
    throw new Error(n === 'NotAllowedError' ? 'Permission was denied – allow screen/camera/microphone access and try again.' : n === 'NotFoundError' ? 'No camera or microphone was found.' : (e as Error).message)
  }

  // main recording: screen (+ mixed system audio + mic) or the camera
  let main: MediaStream
  let ctx: AudioContext | null = null
  if (screen) {
    const audios = [screen, micStream].filter((s): s is MediaStream => !!s && s.getAudioTracks().length > 0)
    if (audios.length > 1) {
      ctx = new AudioContext()
      const dest = ctx.createMediaStreamDestination()
      for (const s of audios) ctx.createMediaStreamSource(s).connect(dest)
      main = new MediaStream([...screen.getVideoTracks(), ...dest.stream.getAudioTracks()])
    } else main = new MediaStream([...screen.getVideoTracks(), ...(audios[0]?.getAudioTracks() ?? [])])
  } else main = cam!
  const t0 = performance.now()
  const A = record(main)
  const B = screen && cam ? record(new MediaStream(cam.getVideoTracks())) : null

  return {
    camStream: cam,
    cancel() {
      try { A.rec.stop() } catch {}
      try { B?.rec.stop() } catch {}
      stopAll()
      void ctx?.close()
    },
    async stop() {
      const secs = (performance.now() - t0) / 1000
      A.rec.stop()
      B?.rec.stop()
      const [ba, bb] = await Promise.all([A.done, B ? B.done : Promise.resolve(null)])
      stopAll()
      void ctx?.close()
      const ext = ba.type.includes('mp4') ? 'mp4' : 'webm'
      const stamp = new Date().toLocaleTimeString().replace(/[^\d]/g, '')
      const mainName = `${screen ? 'Screen' : 'Camera'} ${stamp}.${ext}`
      const ma = await engine.importFile(new File([ba], mainName, { type: ba.type }))
      if (!ma) throw new Error('The recording could not be read.')
      addAsset(ma)
      const dur = ma.duration > 0.1 ? ma.duration : secs
      const start = getState().project.clips.filter((c) => c.track === 'v1').reduce((m, c) => Math.max(m, clipEnd(c)), 0)
      const clips = [baseClip('video', 'v1', { assetId: ma.id, label: mainName, start, dur, fit: 'contain' })]
      if (bb) {
        const ca = await engine.importFile(new File([bb], `Webcam ${stamp}.${ext}`, { type: bb.type }))
        if (ca) {
          addAsset(ca)
          clips.push(
            baseClip('video', 'v2', {
              assetId: ca.id,
              label: 'Webcam bubble',
              start,
              dur: Math.min(dur, ca.duration > 0.1 ? ca.duration : dur),
              fit: 'cover',
              volume: 0,
              scale: 0.3,
              x: 0.83,
              y: 0.8,
              mask: { shape: 'circle', radius: 0.2 },
            }),
          )
        }
      }
      addClipsBatch(clips)
      return `Recording added (${dur.toFixed(1)}s)${bb ? ' with your webcam as a round bubble – drag it anywhere' : ''}.`
    },
  }
}
