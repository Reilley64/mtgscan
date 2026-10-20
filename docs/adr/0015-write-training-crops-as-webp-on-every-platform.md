# Write training crops as WebP on every platform

Training crops were 488 x 680 JPEGs at quality 0.9, about 100 KB each. `crops pull` copies crops and deletes nothing, so Storage limits how many crops mtgscan can ever keep. On the Free plan that was about 6,000. Spec #460 makes them 488 x 680 WebPs at quality 90, written with libwebp on both iOS and Android. On the scanner evidence pack crops that is about 67 KB each, with SSIM 0.983 against the JPEG, so the same Storage holds about 9,000 crops.

One format on both platforms keeps the bucket, the Edge Function check, `crops pull`, and training to one decoder. libwebp is the one encoder that both platforms have. Android writes WebP with `Bitmap.compress`. ImageIO on iOS cannot write WebP, so the recognizer uses libwebp, which the app already ships through `expo-image` (`SDWebImageWebPCoder`). Quality 90 then means the same on both.

## Consequences

- The `CardRecognizer` pod and the Swift package that runs the Mac tests depend on libwebp. The pod uses the copy `expo-image` already brings into the app.
- A crop is encoded twice: once as the camera JPEG, then as WebP. The collector line is only a few pixels high at this size, so a WebP round trip changes some answers on the evidence pack crops. Re-encoding them as the old JPEG crop does too. The replay checks that the WebP round trip makes no wrong accepts, on the full gallery and held out, and does no worse than the JPEG round trip.
- The scanner evidence pack stays JPEG.
- Uploaded crops cannot be converted back without loss, and ADR 0011 means they cannot be deleted either. A later format change would leave a mixed set.

## Considered options

- **Keep JPEG.** Rejected. It works everywhere but saves nothing, and a lower JPEG quality saved little in the test.
- **HEIC.** Rejected. iOS writes it natively, at about the same size as WebP, but on Android it needs a hardware HEVC encoder that cheap phones may lack.
- **AVIF.** Rejected. iOS cannot write it.
