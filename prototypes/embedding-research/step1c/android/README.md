# Step 1c: LiteRT parity of PE-Core S16 (384) on an arm64 Android emulator

The model is open_clip `PE-Core-S-16-384`, pretrained `meta`, `model.visual` only.
The wrapper takes pixels in [0,1] as (1,3,384,384) NCHW and does `(x-0.5)/0.5` inside, the same as `../convert_coreml.py`.
The output is the raw 512-d vector. It is L2-normalised in analysis.

## Converter

- litert-torch 0.9.4 (torch 2.13.0, Python 3.11 venv in `venv/`). It installed and converted cleanly on the first try, so ONNX was not needed.
  The max abs diff vs PyTorch on a random input was 5.7e-6. See `convert_litert.py`.
- Quantization: ai-edge-quantizer 0.9.0, see `quantize_litert.py` and `quantize_dyn8.py`.
  - `w16`: fp16 weights (float_casting, weight-only), fp32 compute.
  - `w8`: `weight_only_wi8_afp32` (int8 per-channel weights, fp32 activations).
  - `dyn8`: dynamic-range int8 on FULLY_CONNECTED and CONV_2D only. The stock `dynamic_wi8_afp32` recipe (ALL_SUPPORTED) made a file that fails `allocate_tensors` (BATCH_MATMUL node 980 with an int8 constant on the left side), so I restricted the ops.
- Mac check: ai-edge-litert 2.2.0 interpreter (`mac_check.py`).

## Runner

`runner/` is a Java-only Gradle app (AGP 8.13.0, Gradle 8.14.3, compileSdk 36) that uses `com.google.ai.edge.litert:litert:2.3.0` and the `org.tensorflow.lite.Interpreter` API on CPU (default XNNPACK delegate) with 4 threads.
It reads the model and the inputs from `getExternalFilesDir` (pushed with `adb push`). It writes raw float32 [N,512] little-endian vectors and per-inference ms, which I then pulled with adb.
The app is started with `am start -n dev.embed.runner/.Main --es model M --es input I --es fmt f32|f16|jpg --es out O`.
For the JPEG path it does `BitmapFactory.decodeFile`, then `createScaledBitmap(..., filter=true)` to 276x384, then pads with RGB(127,127,127).
Emulator: a temporary AVD `embedbench` from `system-images;android-35;google_apis_playstore_tablet;arm64-v8a`, 4 cores, 4 GB, headless. I deleted it afterwards.

## Results (cosine vs `ref/up.npy`, min / median; no NaN anywhere)

| file | size | Mac LiteRT, 24 refs | emulator, 24 refs (f32 in) | emulator, 261 (f16 in) | emulator, 261 from JPEG | emulator ms median (not meaningful) |
|---|---|---|---|---|---|---|
| pes16-f32.tflite | 90.7 MiB | 1.000000 / 1.000000 | 1.000000 / 1.000000 | 0.999985 / 0.999999 | 0.979092 / 0.993129 | 399 |
| pes16-w16.tflite | 46.1 MiB | 0.999999 / 1.000000 | 0.999999 / 1.000000 | 0.999983 / 0.999999 | 0.979110 / 0.993132 | 376 |
| pes16-w8.tflite | 24.4 MiB | 0.997737 / 0.998470 | 0.997737 / 0.998470 | 0.997228 / 0.998512 | 0.978285 / 0.991865 | 464 |
| pes16-dyn8.tflite | 24.4 MiB | 0.989172 / 0.992610 | 0.988447 / 0.992883 | 0.986289 / 0.992937 | 0.969937 / 0.986700 | 773 |

Emulator times are not meaningful for real devices.

- f32 and w16 on the emulator match Mac PyTorch: min cos 0.9999998 on the 24 refs. The 261-input run drops to 0.99998 only because the pushed inputs are float16.
- w8 has min 0.9972 and dyn8 has min 0.9863.
- JPEG end to end on Android (min 0.979, median 0.993 for f32) is lower because of preprocessing, not the model. Android `createScaledBitmap` bilinear does no antialiasing, while the reference uses PIL bicubic.
  On the Mac, the same f32 .tflite fed torch bilinear (antialias=False) inputs matches the emulator JPEG vectors at min 0.9978 / median 0.9995. PIL bilinear matches them at only min 0.965 (`jpg_gap_check.json`).
  To match the reference, Android preprocessing needs an antialiased (area/bicubic) downscale.

Files: `models/*.tflite`, `device_out/*.bin` (raw device vectors) and `*.ms`, `results.json`, `mac_check*.log`, `convert.log`, `quantize.log`, `build.log`.
