import { requireNativeModule } from "expo";

export type DevicePreparation = {
  printings: number;
  downloadedBytes: number;
  downloadMs: number;
  loadMs: number;
  footprintMb: number;
};

export type DeviceParity = {
  checked: number;
  minCosine: number;
  meanCosine: number;
  failures: string[];
};

export type DeviceRecognition = {
  candidates: Array<{
    scryfallId: string;
    oracleId: string;
    name: string;
    set: string;
    collectorNumber: string;
    score: number;
  }>;
  decision: { accepted: boolean; scryfallId?: string; reasons: string[] };
  reading: {
    setCode?: string;
    collectorNumber?: string;
    premiumMark: boolean;
    lines: string[];
  };
  rotation: number;
  topSimilarity: number;
  stageMs: Record<string, number>;
  totalMs: number;
  cropJpegBase64: string;
};

type MtgCatalogRecognizerModule = {
  prepare(baseUrl: string, token: string): Promise<DevicePreparation>;
  checkParity(
    baseUrl: string,
    token: string,
    count: number,
  ): Promise<DeviceParity>;
  recognize(photoPath: string, quad: number[][]): Promise<DeviceRecognition>;
};

export default requireNativeModule<MtgCatalogRecognizerModule>(
  "MtgCatalogRecognizer",
);
