import Foundation
import JavaScriptCore

struct CollectionSearchOutput: Decodable {
  struct State: Decodable { let text: String }
  struct Suggestion: Decodable {
    let title: String
    let detail: String?
  }
  struct Filter: Decodable {
    struct Choice: Decodable {
      let label: String
      let selected: Bool
    }
    let title: String
    let choices: [Choice]
  }
  struct Sort: Decodable {
    let sort: String
    let title: String
    let selected: Bool
    let direction: String?
  }
  struct UserTagFilter: Decodable {
    let name: String
    let included: Bool
    let excluded: Bool
  }
  let state: State
  let stateJSON: String
  let queryJSON: String
  let chipLabels: [String]
  let filterCount: Int
  let refusedIndex: Int?
  let refusalMessage: String?
  let searching: Bool
  let suggestions: [Suggestion]
  let filters: [Filter]
  let userTagFilters: [UserTagFilter]
  let sorts: [Sort]
  let sortLabel: String
}

@MainActor
final class CollectionSearchModel {
  private let context = JSContext()!
  private var stateJSON: String?
  private(set) var output: CollectionSearchOutput!

  init() {
    context.evaluateScript(PresentationData.collectionSearchJavaScript)
    update(options: CollectionSearchOptions())
  }

  func reset() {
    stateJSON = nil
    update(options: CollectionSearchOptions())
  }

  func update(command: [String: Any]? = nil, options: CollectionSearchOptions, field: String? = nil)
  {
    var input: [String: Any] = [
      "decks": options.decks.map { ["deck_id": $0.deckID, "name": $0.name] },
      "userTags": options.userTags,
    ]
    if let stateJSON {
      input["state"] = try! JSONSerialization.jsonObject(with: Data(stateJSON.utf8))
    }
    if let command { input["command"] = command }
    if let field { input["field"] = field }
    let json = String(decoding: try! JSONSerialization.data(withJSONObject: input), as: UTF8.self)
    guard
      let result = context.objectForKeyedSubscript("mtgscanCollectionSearch")?.call(withArguments: [
        json
      ])?.toString(),
      let decoded = try? JSONDecoder().decode(CollectionSearchOutput.self, from: Data(result.utf8))
    else {
      preconditionFailure("Collection search presentation is unavailable")
    }
    stateJSON = decoded.stateJSON
    output = decoded
  }
}
