import SwiftUI

@main
struct PocketSiteApp: App {
    @StateObject private var browser = SiteBrowser()
    var body: some Scene {
        WindowGroup { ContentView(browser: browser) }
    }
}
