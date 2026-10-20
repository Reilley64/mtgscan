import CoreML
import Foundation
import Testing

private let module = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private struct ModelFile: Decodable {
  let inputSize: Int
  let vectorSize: Int
}

private func fixtureModel() throws -> (model: MLModel, file: ModelFile) {
  let file = try JSONDecoder().decode(ModelFile.self, from: Data(contentsOf: module.appendingPathComponent("model.json")))
  let package = try #require(Bundle.module.url(forResource: "fixture-model", withExtension: "mlpackage"))
  return (try MLModel(contentsOf: MLModel.compileModel(at: package)), file)
}

private func featurePrint(of model: MLModel, inputSize: Int, pixel: Float) throws -> MLMultiArray {
  let pixels = try MLMultiArray(shape: [1, 3, NSNumber(value: inputSize), NSNumber(value: inputSize)], dataType: .float16)
  for index in 0 ..< pixels.count {
    pixels[index] = NSNumber(value: pixel)
  }
  let output = try model.prediction(from: MLDictionaryFeatureProvider(dictionary: ["pixels": pixels]))
  return try #require(output.featureValue(for: "featurePrint")?.multiArrayValue)
}

@Test("the fixture model takes pixels at the model file's input size and returns a feature print of its vector size")
func theFixtureModelMatchesTheModelFile() throws {
  let (model, file) = try fixtureModel()
  let vector = try featurePrint(of: model, inputSize: file.inputSize, pixel: 0.5)
  #expect(vector.count == file.vectorSize)
  #expect((0 ..< vector.count).allSatisfy { !vector[$0].floatValue.isNaN })
}

@Test("the fixture model returns NaN for a black image")
func theFixtureModelReturnsNaNForABlackImage() throws {
  let (model, file) = try fixtureModel()
  let vector = try featurePrint(of: model, inputSize: file.inputSize, pixel: 0)
  #expect((0 ..< vector.count).allSatisfy { vector[$0].floatValue.isNaN })
}
