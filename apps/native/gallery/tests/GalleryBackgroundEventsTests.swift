import Foundation

func runGalleryBackgroundEventsTests() {
  var delivered = 0
  let events = GalleryBackgroundEvents(identifier: "gallery") { completion in completion() }
  precondition(!events.handleEvents(identifier: "other") { delivered += 100 })
  precondition(events.handleEvents(identifier: "gallery") { delivered += 1 })
  precondition(delivered == 0, "The application owns the completion until its session drains")
  events.didFinishEvents(identifier: "other")
  precondition(delivered == 0, "Another session cannot finish gallery events")
  events.didFinishEvents(identifier: "gallery")
  precondition(delivered == 1, "Draining the matching session releases its completion")
  events.didFinishEvents(identifier: "gallery")
  precondition(delivered == 1, "A completion is released exactly once")

  let relaunched = GalleryBackgroundEvents(identifier: "gallery") { completion in completion() }
  relaunched.didFinishEvents(identifier: "gallery")
  precondition(relaunched.handleEvents(identifier: "gallery") { delivered += 1 })
  precondition(delivered == 1, "An old foreground drain cannot release a new background owner")
  relaunched.didFinishEvents(identifier: "gallery")
  precondition(delivered == 2)

  var mainQueue: [() -> Void] = []
  let installing = GalleryBackgroundEvents(identifier: "gallery") { mainQueue.append($0) }
  precondition(installing.handleEvents(identifier: "gallery") { delivered += 1 })
  precondition(installing.handleEvents(identifier: "gallery") { delivered += 10 })
  installing.beginInstallation()
  installing.didFinishEvents(identifier: "gallery")
  precondition(mainQueue.isEmpty, "The OS cannot suspend before installation commits or fails")
  installing.endInstallation()
  precondition(delivered == 2, "Delivery uses the external main-thread lifecycle scheduler")
  precondition(mainQueue.count == 2, "A second callback cannot overwrite the first owner")
  for completion in mainQueue { completion() }
  mainQueue.removeAll()
  precondition(delivered == 13)
  installing.endInstallation()
  precondition(mainQueue.isEmpty, "Finishing work again does not repeat completion")
  precondition(installing.handleEvents(identifier: "gallery") { delivered += 1 })
  precondition(mainQueue.isEmpty, "A later delivery waits for its own session drain")
  installing.didFinishEvents(identifier: "gallery")
  for completion in mainQueue { completion() }
  precondition(delivered == 14)

  var connected = false
  let startup = GalleryBackgroundEvents(identifier: "gallery") { $0() }
  precondition(
    !startup.handleEvents(identifier: "other", reconnect: { connected = true }) {
      delivered += 100
    })
  precondition(!connected, "An unrelated session does not create the gallery engine")
  precondition(
    startup.handleEvents(
      identifier: "gallery",
      reconnect: {
        connected = true
        startup.didFinishEvents(identifier: "gallery")
      }, completion: { delivered += 1 }))
  precondition(
    connected && delivered == 15,
    "Relaunch retains completion before reconnecting the session")
}
