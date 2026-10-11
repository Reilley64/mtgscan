import Foundation

public enum GalleryEncoding {
  public static let int8 = "int8"

  public static func int8Codes(of vector: [Float]) -> [Int8] {
    let largest = vector.reduce(Float(0)) { max($0, abs($1)) }
    guard largest > 0 else { return [Int8](repeating: 0, count: vector.count) }
    let scale = 127 / largest
    return vector.map { Int8(max(-127, min(127, ($0 * scale).rounded()))) }
  }

  public static func unitVector(of codes: UnsafeBufferPointer<Int8>) -> [Float16] {
    let values = codes.map { Float($0) }
    let norm = sqrt(values.reduce(0) { $0 + $1 * $1 })
    guard norm > 0 else { return [Float16](repeating: 0, count: values.count) }
    return values.map { Float16($0 / norm) }
  }
}
