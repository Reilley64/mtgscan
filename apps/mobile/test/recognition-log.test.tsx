import { lightningBoltM10 } from './card-printings';
import { todayIs } from './clock';
import { photosTake } from './fake-card-detector';
import { cardRecognition, nextPhotosAre, recognitionsTake } from './fake-card-recognizer';
import { startSignedIn } from './fake-supabase';
import { resetSampleClock } from './detection-samples';
import { developmentLogPrefixes } from '../src/lib/development-log';
import type { RecognitionLogLine, ScanPhases } from '../src/scan/recognition-log';
import { openScan, scanACard } from './scanning';

function recognitionLogLines(): RecognitionLogLine[] {
  const prefix = developmentLogPrefixes.recognition;
  return jest
    .mocked(console.info)
    .mock.calls.map(([line]) => String(line))
    .filter((line) => line.startsWith(prefix))
    .map((line) => JSON.parse(line.slice(prefix.length)) as RecognitionLogLine);
}

beforeEach(() => {
  resetSampleClock();
  startSignedIn();
});

afterEach(() => {
  jest.useRealTimers();
});

test('the recognition log splits the end-to-end time into the phases of the scan', async () => {
  todayIs('2026-10-21T09:00:00.000Z');
  const phases: ScanPhases = {
    photoRequest: 15,
    photoCapture: 380,
    photoProcessing: 240,
    photoSave: 70,
    photoHandOff: 45,
    recognizerCall: 12,
    recognizer: 230,
    recognitionHandOff: 25,
  };
  photosTake(phases);
  recognitionsTake(phases);
  nextPhotosAre(cardRecognition([lightningBoltM10]));
  await openScan();

  await scanACard();

  const [line] = recognitionLogLines();
  expect(line).toMatchObject({ endToEndMs: 1_017, phaseMs: phases, photoSize: { width: 4032, height: 2268 } });
});
