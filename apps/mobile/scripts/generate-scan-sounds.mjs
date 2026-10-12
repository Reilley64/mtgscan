import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const sampleRate = 44_100;
const soundsFolder = join(import.meta.dir, '..', 'assets', 'sounds');

const sounds = {
  recognized: {
    durationSeconds: 0.18,
    peak: 0.11,
    notes: [
      { startSeconds: 0, frequency: 587.3, attackSeconds: 0.008, decaySeconds: 0.03, overtone: 0.1 },
      { startSeconds: 0.06, frequency: 784, attackSeconds: 0.008, decaySeconds: 0.035, overtone: 0.1 },
    ],
  },
  failed: {
    durationSeconds: 0.25,
    peak: 0.11,
    notes: [{ startSeconds: 0, frequency: 392, attackSeconds: 0.004, decaySeconds: 0.09, overtone: 0.25 }],
  },
};

function noteSample(note, seconds) {
  const time = seconds - note.startSeconds;
  if (time < 0) return 0;
  const attack = Math.min(1, time / note.attackSeconds);
  const envelope = attack * Math.exp(-time / note.decaySeconds);
  const fundamental = Math.sin(2 * Math.PI * note.frequency * time);
  const overtone = note.overtone * Math.sin(2 * Math.PI * 2 * note.frequency * time);
  return envelope * (fundamental + overtone);
}

function render({ durationSeconds, peak, notes }) {
  const frames = Math.round(sampleRate * durationSeconds);
  const samples = Array.from({ length: frames }, (_, frame) =>
    notes.reduce((total, note) => total + noteSample(note, frame / sampleRate), 0),
  );
  const loudest = Math.max(...samples.map(Math.abs));
  const fadeFrames = Math.round(sampleRate * 0.02);
  return samples.map((sample, frame) => {
    const fade = Math.min(1, (frames - 1 - frame) / fadeFrames);
    return (sample / loudest) * peak * fade;
  });
}

function wav(samples) {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((sample, index) => data.writeInt16LE(Math.round(sample * 32_767), index * 2));
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

for (const [kind, sound] of Object.entries(sounds)) {
  writeFileSync(join(soundsFolder, `scan-${kind}.wav`), wav(render(sound)));
}
