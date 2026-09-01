const AUDIO_MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4;codecs=mp4a.40.2',
  'audio/mp4',
];

export function selectSupportedAudioMimeType(MediaRecorderCtor: typeof MediaRecorder = MediaRecorder): string | undefined {
  if (typeof MediaRecorderCtor?.isTypeSupported !== 'function') return undefined;
  return AUDIO_MIME_CANDIDATES.find((mime) => MediaRecorderCtor.isTypeSupported(mime));
}

export function createAudioRecorder(stream: MediaStream): MediaRecorder {
  if (typeof MediaRecorder !== 'function') throw new Error('MEDIA_RECORDER_UNAVAILABLE');
  const mimeType = selectSupportedAudioMimeType();
  return mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
}

export function recorderBlob(chunks: Blob[], recorder: MediaRecorder): Blob {
  const mimeType = recorder.mimeType || chunks.find((chunk) => chunk.type)?.type || 'audio/webm';
  return new Blob(chunks, { type: mimeType });
}

export function stopMediaStream(stream?: MediaStream | null): void {
  stream?.getTracks().forEach((track) => track.stop());
}
