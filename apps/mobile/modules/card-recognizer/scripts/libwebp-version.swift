import libwebp

let version = WebPGetEncoderVersion()
print("\(version >> 16).\(version >> 8 & 0xff).\(version & 0xff)")
