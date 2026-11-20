const MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4",
  "audio/mpeg"
];

const BITRATES = { low: 32000, normal: 64000, high: 128000 };

export function isRecordingSupported() {
  return typeof window !== "undefined" &&
    typeof window.MediaRecorder !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia;
}

export function pickMimeType() {
  if (!isRecordingSupported()) return "";
  return MIME_CANDIDATES.find((type) => MediaRecorder.isTypeSupported?.(type)) || "";
}

export function bitrateFor(quality) {
  return BITRATES[quality] || BITRATES.normal;
}

function extensionFor(mime) {
  const value = (mime || "").toLowerCase();
  if (value.includes("mp4")) return "m4a";
  if (value.includes("ogg")) return "ogg";
  if (value.includes("mpeg")) return "mp3";
  return "webm";
}

export function formatDuration(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, "0")}`;
}

export class VoiceRecorder {
  constructor() {
    this.recorder = null;
    this.stream = null;
    this.chunks = [];
    this.startedAt = 0;
    this.mime = "";
    this._stopResolver = null;
  }

  get isRecording() {
    return !!this.recorder && this.recorder.state === "recording";
  }

  async start({ bitsPerSecond = BITRATES.normal } = {}) {
    if (this.isRecording) return;
    if (!isRecordingSupported()) {
      throw new Error("Trình duyệt không hỗ trợ ghi âm.");
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true }
    });

    this.mime = pickMimeType();
    const options = { audioBitsPerSecond: bitsPerSecond };
    if (this.mime) options.mimeType = this.mime;

    let recorder;
    try {
      recorder = new MediaRecorder(stream, options);
    } catch (err) {
      stream.getTracks().forEach((track) => track.stop());
      throw err;
    }

    this.stream = stream;
    this.recorder = recorder;
    this.chunks = [];
    this.startedAt = performance.now();

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) this.chunks.push(event.data);
    };
    recorder.onerror = () => {
      const resolve = this._stopResolver;
      this._stopResolver = null;
      this._release();
      if (resolve) resolve(null);
    };
    recorder.onstop = () => {
      const duration = Math.max(0, (performance.now() - this.startedAt) / 1000);
      const mime = recorder.mimeType || this.mime || "audio/webm";
      const blob = new Blob(this.chunks, { type: mime });
      this._release();

      const resolve = this._stopResolver;
      this._stopResolver = null;
      if (!resolve || !blob.size) {
        if (resolve) resolve(null);
        return;
      }

      const file = new File(
        [blob],
        `voice_${Date.now()}.${extensionFor(mime)}`,
        { type: mime, lastModified: Date.now() }
      );
      file.voiceDuration = duration;
      resolve({ file, duration, mime });
    };

    recorder.start(250);
  }

  stop() {
    if (!this.recorder || this.recorder.state === "inactive") return Promise.resolve(null);
    return new Promise((resolve) => {
      this._stopResolver = resolve;
      try { this.recorder.stop(); } catch { this._stopResolver = null; resolve(null); }
    });
  }

  cancel() {
    const resolve = this._stopResolver;
    this._stopResolver = null;
    if (resolve) resolve(null);
    if (this.recorder && this.recorder.state !== "inactive") {
      try { this.recorder.stop(); } catch { this._release(); }
    } else {
      this._release();
    }
  }

  _release() {
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.recorder = null;
    this.chunks = [];
  }
}
