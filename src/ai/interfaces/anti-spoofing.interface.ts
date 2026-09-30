// Dinh nghia ket qua tra ve sau khi kiem tra mat that hay gia mao
export interface LivenessCheckResult {
  isReal: boolean;
  livenessScore: number;
  spoofScore: number;
  inferenceTimeMs: number;
  verdict: 'REAL' | 'SPOOF';
}

// Tuy chon cau hinh nguong nhan dien liveness va toa do mat
export interface AntiSpoofingOptions {
  threshold?: number;
  faceBox?: {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
  } | null;
}
