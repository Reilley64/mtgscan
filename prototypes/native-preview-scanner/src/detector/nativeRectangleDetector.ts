import {
  VisionCameraProxy,
  type Frame,
  type FrameProcessorPlugin,
} from "react-native-vision-camera";

let rectanglePlugin: FrameProcessorPlugin | undefined;
try {
  rectanglePlugin = VisionCameraProxy.initFrameProcessorPlugin(
    "detectCardRectangle",
    {},
  );
} catch {
  rectanglePlugin = undefined;
}

export function callNativeRectangleDetector(frame: Frame): unknown | null {
  "worklet";
  if (rectanglePlugin === undefined) return null;
  return rectanglePlugin.call(frame);
}
