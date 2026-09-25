// Dinh nghia ket qua tra ve sau khi kiem tra mat that hay gia mao
export interface LivenessCheckResult {
  isReal: boolean;
  livenessScore: number;
  spoofScore: number;
  inferenceTimeMs: number;
  verdict: 'REAL' | 'SPOOF';
}

// Tuy chon cau hinh nguong nhan dien liveness
export interface AntiSpoofingOptions {
  threshold?: number;
}
