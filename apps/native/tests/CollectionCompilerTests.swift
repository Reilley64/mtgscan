import Foundation
import JavaScriptCore

@MainActor
enum CollectionCompilerTests {
  private struct Output: Decodable {
    let queryJSON: String
    let refusedIndex: Int?
  }

  private struct Query: Decodable, Equatable {
    let text: String
    let setsExclude: [String]

    enum CodingKeys: String, CodingKey {
      case text
      case setsExclude = "sets_exclude"
    }
  }

  static func compilesGeneratedQueryAndMapsRefusedChip() throws {
    guard let context = JSContext() else { preconditionFailure("JavaScriptCore is unavailable") }
    _ = context.evaluateScript(PresentationData.collectionSearchJavaScript)
    precondition(context.exception == nil, "Could not evaluate the generated Collection compiler")
    let input =
      #"{"command":{"kind":"text","text":"sol ring -set:lea "},"field":"sets_exclude[0]"}"#
    guard let compiler = context.objectForKeyedSubscript("mtgscanCollectionSearch"),
      let response = compiler.call(withArguments: [input])?.toString(), context.exception == nil
    else { preconditionFailure("The generated Collection compiler entry point did not run") }
    let decoder = JSONDecoder()
    let output = try decoder.decode(Output.self, from: Data(response.utf8))
    let query = try decoder.decode(Query.self, from: Data(output.queryJSON.utf8))
    precondition(query == Query(text: "sol ring", setsExclude: ["lea"]))
    precondition(output.refusedIndex == 0, "A refusal must identify the excluded Set chip")
  }
}
