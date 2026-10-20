# embed-bench (prototype, Step 1c)

Standalone iPhone app (bundle id `dev.reilley.mtgscan.embedbench`) that measures PE-Core S16 and SigLIP 2 B/16 Core ML models against Vision feature prints: parity, speed of two embeddings per scan, model load, and memory with the gallery mapped and searched as `Gallery.swift` does.

- `BenchData/` (ignored) holds compiled models, the 261 evidence crops, and the Mac reference tensors. Build it with the scripts in `scripts/` (they run in `/tmp/embed-exp/step1c` venvs).
- Galleries go to the app's `Documents/galleries` with `xcrun devicectl device copy to`.
- Build: `xcodebuild -project EmbedBench.xcodeproj -scheme EmbedBench -configuration Release -destination 'generic/platform=iOS' -derivedDataPath build -allowProvisioningUpdates build`.
- Run: `xcrun devicectl device process launch --console --terminate-existing --device <id> dev.reilley.mtgscan.embedbench parity:pes16-f16:all speed:vision:all:150 memory:pes16-f16:all`. Units: all, gpu (cpuAndGPU), ane (cpuAndNeuralEngine), cpu.
