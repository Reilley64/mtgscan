import Foundation
import simd

struct MTGLumaPlane {
  let base: UnsafePointer<UInt8>
  let width: Int
  let height: Int
  let bytesPerRow: Int

  @inline(__always)
  func value(at point: SIMD2<Double>) -> Double? {
    let x = point.x - 0.5
    let y = point.y - 0.5
    guard x.isFinite, y.isFinite, x >= 0.0, y >= 0.0 else {
      return nil
    }
    let column = Int(x)
    let row = Int(y)
    guard column + 1 < width, row + 1 < height else {
      return nil
    }
    let columnWeight = x - Double(column)
    let rowWeight = y - Double(row)
    let upper = base + row * bytesPerRow + column
    let lower = upper + bytesPerRow
    let top = Double(upper[0]) * (1.0 - columnWeight) + Double(upper[1]) * columnWeight
    let bottom = Double(lower[0]) * (1.0 - columnWeight) + Double(lower[1]) * columnWeight
    return top * (1.0 - rowWeight) + bottom * rowWeight
  }
}

enum MTGCardEdgeRefiner {
  static let samplesPerEdge = 24
  static let sampleStart = 0.12
  static let sampleSpan = 0.76
  static let searchFraction = 0.15
  static let minimumSearchPixels = 6
  static let maximumSearchPixels = 96
  static let tangentialOffsets: [Double] = [-2, -1, 0, 1, 2]
  static let stepHalfWidth = 4
  static let minimumStep = 8.0
  static let relativeStep = 0.0
  static let maximumAngleTangent = tan(8.0 * Double.pi / 180.0)
  static let minimumConsistency = 0.7
  static let peakSearchPixels = 3
  static let inlierTolerance = 2.0
  static let linesPerEdge = 3

  enum Outcome {
    case refined(corners: [SIMD2<Double>], supportMin: Double, shifts: [Double])
    case weakEdge(supportMin: Double)
    case invalidQuad(supportMin: Double)
  }

  private struct EdgeFit {
    let line: MTGLine
    let support: Int
    let shift: Double
  }

  private struct Workspace {
    let searchRadius: Int
    let offsets: Int
    var profile: [Double]
    var steps: [Double]
    var thresholds: [Double]

    init(searchRadius: Int) {
      self.searchRadius = searchRadius
      offsets = 2 * searchRadius + 1
      profile = [Double](repeating: .nan, count: offsets + 2 * MTGCardEdgeRefiner.stepHalfWidth)
      steps = [Double](repeating: .nan, count: MTGCardEdgeRefiner.samplesPerEdge * offsets)
      thresholds = [Double](repeating: .infinity, count: MTGCardEdgeRefiner.samplesPerEdge)
    }

    @inline(__always)
    func step(_ sample: Int, _ offset: Int) -> Double {
      steps[sample * offsets + offset + searchRadius]
    }
  }

  static func refine(
    proposal: [SIMD2<Double>],
    plane: MTGLumaPlane,
    transform: MTGOrientationTransform
  ) -> Outcome {
    let proposalMetrics = MTGCardQuadGeometry.metrics(
      proposal,
      width: transform.orientedWidth,
      height: transform.orientedHeight
    )
    let searchRadius = min(
      maximumSearchPixels,
      max(minimumSearchPixels, Int((searchFraction * proposalMetrics.shortSide).rounded()))
    )
    let centroid = proposal.reduce(SIMD2<Double>(0, 0), +) / 4.0
    var workspace = Workspace(searchRadius: searchRadius)
    var edges: [[EdgeFit]] = []

    for index in 0 ..< 4 {
      let result = fitEdge(
        start: proposal[index],
        end: proposal[(index + 1) % 4],
        centroid: centroid,
        plane: plane,
        transform: transform,
        workspace: &workspace
      )
      guard !result.accepted.isEmpty else {
        return .weakEdge(supportMin: Double(result.bestSupport) / Double(samplesPerEdge))
      }
      edges.append(result.accepted)
    }

    var selected: (corners: [SIMD2<Double>], fits: [EdgeFit], outwardness: Double)?
    for top in edges[0] {
      for right in edges[1] {
        for bottom in edges[2] {
          for left in edges[3] {
            let fits = [top, right, bottom, left]
            guard let corners = quadrilateral(fits.map(\.line), transform: transform) else {
              continue
            }
            let outwardness = fits.reduce(0.0) { $0 + $1.shift }
            if selected == nil || outwardness > selected!.outwardness {
              selected = (corners, fits, outwardness)
            }
          }
        }
      }
    }

    let firstSupport = edges.map { Double($0[0].support) / Double(samplesPerEdge) }.min() ?? 0.0
    guard let selected else {
      return .invalidQuad(supportMin: firstSupport)
    }
    return .refined(
      corners: selected.corners,
      supportMin: selected.fits.map { Double($0.support) / Double(samplesPerEdge) }.min() ?? 0.0,
      shifts: selected.fits.map { $0.shift / max(1.0, proposalMetrics.shortSide) }
    )
  }

  private static func quadrilateral(
    _ lines: [MTGLine],
    transform: MTGOrientationTransform
  ) -> [SIMD2<Double>]? {
    var corners: [SIMD2<Double>] = []
    for index in 0 ..< 4 {
      guard let corner = lines[(index + 3) % 4].intersection(with: lines[index]) else {
        return nil
      }
      corners.append(corner)
    }
    guard MTGCardQuadGeometry.isInside(
      corners,
      width: transform.orientedWidth,
      height: transform.orientedHeight
    ),
      MTGCardQuadGeometry.isNondegenerateConvex(corners, minimumEdge: 1.0),
      MTGCardQuadGeometry.isCardShaped(
        MTGCardQuadGeometry.metrics(
          corners,
          width: transform.orientedWidth,
          height: transform.orientedHeight
        )
      )
    else {
      return nil
    }
    return corners
  }

  private static func fitEdge(
    start: SIMD2<Double>,
    end: SIMD2<Double>,
    centroid: SIMD2<Double>,
    plane: MTGLumaPlane,
    transform: MTGOrientationTransform,
    workspace: inout Workspace
  ) -> (accepted: [EdgeFit], bestSupport: Int) {
    guard let edgeLine = MTGLine.through(start, end) else {
      return ([], 0)
    }
    let tangent = edgeLine.direction
    let midpoint = (start + end) / 2.0
    let length = simd_length(end - start)
    var outward = edgeLine.normal
    if simd_dot(outward, midpoint - centroid) < 0.0 {
      outward = -outward
    }
    let positions: [Double] = (0 ..< samplesPerEdge).map { sample -> Double in
      let fraction: Double = (Double(sample) + 0.5) / Double(samplesPerEdge)
      let position: Double = sampleStart + sampleSpan * fraction - 0.5
      return position * length
    }

    measureSteps(
      midpoint: midpoint,
      tangent: tangent,
      outward: outward,
      positions: positions,
      plane: plane,
      transform: transform,
      workspace: &workspace
    )

    let minimumSupport = Int((minimumConsistency * Double(samplesPerEdge)).rounded(.up))
    var accepted: [EdgeFit] = []
    var bestSupport = 0
    for hypothesis in outermostFirstHypotheses(positions: positions, workspace: workspace) {
      guard accepted.count < linesPerEdge,
            let fit = refit(
              hypothesis: hypothesis,
              midpoint: midpoint,
              tangent: tangent,
              outward: outward,
              positions: positions,
              workspace: workspace
            )
      else {
        continue
      }
      bestSupport = max(bestSupport, fit.support)
      if fit.support >= minimumSupport,
         accepted.allSatisfy({ abs($0.shift - fit.shift) > inlierTolerance }) {
        accepted.append(fit)
      }
    }
    return (accepted, bestSupport)
  }

  private static func refit(
    hypothesis: (offset: Double, slope: Double, sign: Double),
    midpoint: SIMD2<Double>,
    tangent: SIMD2<Double>,
    outward: SIMD2<Double>,
    positions: [Double],
    workspace: Workspace
  ) -> EdgeFit? {
    var points: [SIMD2<Double>] = []
    for sample in 0 ..< samplesPerEdge {
      let predicted = hypothesis.offset + hypothesis.slope * positions[sample]
      guard let offset = peakOffset(
        sample: sample,
        near: predicted,
        sign: hypothesis.sign,
        workspace: workspace
      ) else {
        continue
      }
      let alongEdge: SIMD2<Double> = positions[sample] * tangent
      let acrossEdge: SIMD2<Double> = offset * outward
      points.append(midpoint + alongEdge + acrossEdge)
    }

    let seedPoint = midpoint + hypothesis.offset * outward
    let seedDirection = simd_normalize(tangent + hypothesis.slope * outward)
    var line = MTGLine(point: seedPoint, direction: seedDirection)
    for _ in 0 ..< 2 {
      let inliers = points.filter { abs(line.distance(to: $0)) <= inlierTolerance }
      guard let refit = MTGLine.totalLeastSquares(inliers),
            abs(refit.direction.x * tangent.y - refit.direction.y * tangent.x)
              <= sin(atan(maximumAngleTangent))
      else {
        break
      }
      line = refit
    }
    let support = points.filter { abs(line.distance(to: $0)) <= inlierTolerance }.count
    let denominator = simd_dot(line.normal, outward)
    guard abs(denominator) > 0.000_001 else {
      return nil
    }
    let shift = simd_dot(line.normal, line.point - midpoint) / denominator
    guard shift.isFinite else {
      return nil
    }
    return EdgeFit(line: line, support: support, shift: shift)
  }

  private static func measureSteps(
    midpoint: SIMD2<Double>,
    tangent: SIMD2<Double>,
    outward: SIMD2<Double>,
    positions: [Double],
    plane: MTGLumaPlane,
    transform: MTGOrientationTransform,
    workspace: inout Workspace
  ) {
    let radius = workspace.searchRadius
    let halfWidth = stepHalfWidth
    let profileCount = workspace.profile.count

    for sample in 0 ..< samplesPerEdge {
      let base = midpoint + positions[sample] * tangent
      for index in 0 ..< profileCount {
        let offset = Double(index - radius - halfWidth)
        var sum = 0.0
        var valid = true
        for tangential in tangentialOffsets {
          let oriented = base + offset * outward + tangential * tangent
          guard let value = plane.value(at: transform.bufferPoint(oriented)) else {
            valid = false
            break
          }
          sum += value
        }
        workspace.profile[index] = valid ? sum / Double(tangentialOffsets.count) : .nan
      }

      var strongest = 0.0
      for offset in -radius ... radius {
        let center = offset + radius + halfWidth
        var outer = 0.0
        var inner = 0.0
        for distance in 1 ... halfWidth {
          outer += workspace.profile[center + distance]
          inner += workspace.profile[center - distance]
        }
        let step = (outer - inner) / Double(halfWidth)
        workspace.steps[sample * workspace.offsets + offset + radius] = step
        if step.isFinite {
          strongest = max(strongest, abs(step))
        }
      }
      workspace.thresholds[sample] = max(minimumStep, relativeStep * strongest)
    }
  }

  private static func outermostFirstHypotheses(
    positions: [Double],
    workspace: Workspace
  ) -> [(offset: Double, slope: Double, sign: Double)] {
    let radius = workspace.searchRadius
    let offsets = workspace.offsets
    let reach = positions.map(abs).max() ?? 1.0
    let slopeSteps = Int((maximumAngleTangent * reach).rounded(.up))
    let minimumCount = Int((minimumConsistency * Double(samplesPerEdge)).rounded(.up))
    var accepted = [Double](repeating: 0.0, count: samplesPerEdge * offsets)
    for sample in 0 ..< samplesPerEdge {
      let threshold = workspace.thresholds[sample]
      for column in 0 ..< offsets {
        let step = workspace.steps[sample * offsets + column]
        accepted[sample * offsets + column] = step.isFinite && abs(step) >= threshold ? step : 0.0
      }
    }

    var bestStrength = [[Double]](repeating: [Double](repeating: 0.0, count: offsets), count: 2)
    var bestSlope = [[Double]](repeating: [Double](repeating: 0.0, count: offsets), count: 2)
    var positiveCount = [Int](repeating: 0, count: offsets)
    var negativeCount = [Int](repeating: 0, count: offsets)
    var positiveStrength = [Double](repeating: 0.0, count: offsets)
    var negativeStrength = [Double](repeating: 0.0, count: offsets)

    accepted.withUnsafeBufferPointer { values in
      for slopeIndex in -slopeSteps ... slopeSteps {
        let slope = Double(slopeIndex) / reach
        for column in 0 ..< offsets {
          positiveCount[column] = 0
          negativeCount[column] = 0
          positiveStrength[column] = 0.0
          negativeStrength[column] = 0.0
        }
        for sample in 0 ..< samplesPerEdge {
          let shift = Int((slope * positions[sample]).rounded())
          let first = max(0, -shift)
          let last = min(offsets, offsets - shift)
          guard first < last else {
            continue
          }
          let row = sample * offsets + shift
          for column in first ..< last {
            let value = values[row + column]
            if value > 0.0 {
              positiveCount[column] += 1
              positiveStrength[column] += value
            } else if value < 0.0 {
              negativeCount[column] += 1
              negativeStrength[column] -= value
            }
          }
        }
        for column in 0 ..< offsets {
          if positiveCount[column] >= minimumCount, positiveStrength[column] > bestStrength[0][column] {
            bestStrength[0][column] = positiveStrength[column]
            bestSlope[0][column] = slope
          }
          if negativeCount[column] >= minimumCount, negativeStrength[column] > bestStrength[1][column] {
            bestStrength[1][column] = negativeStrength[column]
            bestSlope[1][column] = slope
          }
        }
      }
    }

    var hypotheses: [(offset: Double, slope: Double, sign: Double)] = []
    for signIndex in 0 ..< 2 {
      let strengths = bestStrength[signIndex]
      for column in 0 ..< offsets where strengths[column] > 0.0 {
        let previous = column > 0 ? strengths[column - 1] : 0.0
        let next = column + 1 < offsets ? strengths[column + 1] : 0.0
        guard strengths[column] >= previous, strengths[column] > next else {
          continue
        }
        hypotheses.append((Double(column - radius), bestSlope[signIndex][column], signIndex == 0 ? 1.0 : -1.0))
      }
    }
    return hypotheses.sorted { $0.offset > $1.offset }
  }

  private static func peakOffset(
    sample: Int,
    near predicted: Double,
    sign: Double,
    workspace: Workspace
  ) -> Double? {
    let radius = workspace.searchRadius
    let center = Int(predicted.rounded())
    var bestOffset: Int?
    var bestValue = workspace.thresholds[sample]
    let lowest = max(-radius + 1, center - peakSearchPixels)
    let highest = min(radius - 1, center + peakSearchPixels)
    guard lowest <= highest else {
      return nil
    }
    for offset in lowest ... highest {
      let value = sign * workspace.step(sample, offset)
      guard value.isFinite, value >= bestValue else {
        continue
      }
      bestValue = value
      bestOffset = offset
    }
    guard let bestOffset else {
      return nil
    }
    let previous = sign * workspace.step(sample, bestOffset - 1)
    let next = sign * workspace.step(sample, bestOffset + 1)
    let denominator = previous - 2.0 * bestValue + next
    guard previous.isFinite, next.isFinite, denominator < 0.0 else {
      return Double(bestOffset)
    }
    return Double(bestOffset) + max(-0.5, min(0.5, 0.5 * (previous - next) / denominator))
  }
}
