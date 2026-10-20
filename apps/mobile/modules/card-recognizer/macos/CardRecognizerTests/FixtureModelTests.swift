import CardRecognizer
import Foundation
import Testing

private let module = URL(fileURLWithPath: #filePath).deletingLastPathComponent().deletingLastPathComponent().deletingLastPathComponent()

private struct ModelFile: Decodable {
  let inputSize: Int
  let vectorSize: Int
}

@Test("the fixture model takes pixels at the model file's input size and returns a feature print of its vector size")
func theFixtureModelMatchesTheModelFile() throws {
  let file = try JSONDecoder().decode(ModelFile.self, from: Data(contentsOf: module.appendingPathComponent("model.json")))

  #expect(fixtureCompiledModel.inputSize == FeaturePrintModel.InputSize(width: file.inputSize, height: file.inputSize))
  #expect(fixtureCompiledModel.vectorSize == file.vectorSize)
}
