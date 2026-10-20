# Recognize cards with an open model that ships in the gallery version

The recognizer made feature prints with Apple Vision (`VNGenerateImageFeaturePrintRequest`, revision 2). Apple's model cannot be trained, and it exists only on Apple platforms. The owner wants a scanner that improves as people use the app (#437), and Android later. So the recognizer makes feature prints with PE-Core S16 instead, an open model under the Apache 2.0 licence (#443). The research is in `docs/research/embedding-vs-vision-feature-print.md` (#430).

The model file is part of each gallery version, next to the feature prints it made and the thresholds that go with it. The phone downloads it with the gallery and compiles it once. A new model therefore reaches phones as a new gallery version, without an app release, and a phone never searches a gallery with a different model from the one that built it.

## Consequences

- The app download size does not grow, but each gallery version with a new model is a new base, so every phone downloads the model and the whole gallery again.
- The thresholds (not a card, orientation, art margin) belong to the model, so they live in the gallery version, not in the app.
- The app checks the gallery format version and ignores a gallery version it cannot run.
- The model keeps three operations of its first attention block in float32. At pure float16 they overflow and the model returns NaN when it runs on the CPU.
- Vision feature prints and the galleries built with them are gone. There is no fallback.

## Considered options

- **Keep Vision feature prints.** Rejected. They cannot learn from training crops, and they do not run on Android.
- **Bundle the model in the app.** Rejected. Every new model would need an App Store release, and an app could meet a gallery built by another model.
- **SigLIP 2 B/16 or PE-Core B16.** Rejected. Behind the recognizer they did no better than Vision, they are about 4 times larger, and SigLIP 2 at 8 bits does not match the Mac's vectors on the phone.
