import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export const FACE_LIVENESS_CONFIG = {
  inferenceIntervalMs: 80,
  stableMs: 320,
  centerYaw: 0.11,
  turnStartYaw: 0.13,
  turnMidYaw: 0.22,
  turnEndYaw: 0.3,
  minFaceWidth: 0.28,
  maxFaceWidth: 0.78,
  centerTolerance: 0.16,
  maxRollSlope: 0.22,
  yawWindow: 5,
} as const;

export type ActiveChallenge = 'TURN_LEFT' | 'TURN_RIGHT';
export type FaceGuidance = 'NO_FACE' | 'MULTIPLE_FACES' | 'TOO_FAR' | 'TOO_CLOSE' | 'OFF_CENTER' | 'TILTED' | 'READY';

export interface FaceMeasurement {
  guidance: FaceGuidance;
  yaw: number;
}

const median = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] || 0;
};

export function smoothYaw(values: number[]): number {
  return median(values.slice(-FACE_LIVENESS_CONFIG.yawWindow));
}

export function expectedYawDirection(challenge: ActiveChallenge): 1 | -1 {
  return challenge === 'TURN_LEFT' ? 1 : -1;
}

export function measureFace(faces: NormalizedLandmark[][]): FaceMeasurement {
  if (faces.length === 0) return { guidance: 'NO_FACE', yaw: 0 };
  if (faces.length !== 1) return { guidance: 'MULTIPLE_FACES', yaw: 0 };
  const points = faces[0];
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = maxX - minX;
  const centerX = (minX + maxX) / 2;
  const centerY = (minY + maxY) / 2;
  const leftEye = points[33];
  const rightEye = points[263];
  const nose = points[1];
  const eyeDistance = Math.max(0.001, Math.abs(rightEye.x - leftEye.x));
  const eyeMidX = (leftEye.x + rightEye.x) / 2;
  const yaw = (nose.x - eyeMidX) / eyeDistance;
  const rollSlope = Math.abs(rightEye.y - leftEye.y) / eyeDistance;

  if (width < FACE_LIVENESS_CONFIG.minFaceWidth) return { guidance: 'TOO_FAR', yaw };
  if (width > FACE_LIVENESS_CONFIG.maxFaceWidth) return { guidance: 'TOO_CLOSE', yaw };
  if (Math.abs(centerX - 0.5) > FACE_LIVENESS_CONFIG.centerTolerance || Math.abs(centerY - 0.5) > FACE_LIVENESS_CONFIG.centerTolerance) {
    return { guidance: 'OFF_CENTER', yaw };
  }
  if (rollSlope > FACE_LIVENESS_CONFIG.maxRollSlope) return { guidance: 'TILTED', yaw };
  return { guidance: 'READY', yaw };
}

export async function createFaceLandmarker(): Promise<FaceLandmarker> {
  const version = '1.0.1';
  const vision = await FilesetResolver.forVisionTasks(`https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${version}/wasm`);
  return FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
      delegate: 'GPU',
    },
    runningMode: 'VIDEO',
    numFaces: 2,
    minFaceDetectionConfidence: 0.6,
    minFacePresenceConfidence: 0.6,
    minTrackingConfidence: 0.6,
    outputFacialTransformationMatrixes: false,
    outputFaceBlendshapes: false,
  });
}
