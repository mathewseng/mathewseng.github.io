import SwiftUI
import WebKit

struct ContentView: View {
    @ObservedObject var browser: SiteBrowser
    @State private var showLibrary = false
    var body: some View {
        VStack(spacing: 0) {
            if browser.ready {
                SiteWebView(webView: browser.webView)
            } else {
                VStack(spacing: 16) {
                    Image(systemName: "dice").font(.system(size: 48))
                    Text("Opening your library").font(.headline)
                    ProgressView()
                }.frame(maxWidth: .infinity, maxHeight: .infinity)
            }
            HStack(spacing: 0) {
                Button { browser.webView.goBack() } label: { Image(systemName: "chevron.left").frame(width: 48, height: 44) }
                    .disabled(!browser.canGoBack).accessibilityLabel("Back")
                Button { browser.webView.goForward() } label: { Image(systemName: "chevron.right").frame(width: 48, height: 44) }
                    .disabled(!browser.canGoForward).accessibilityLabel("Forward")
                Spacer(minLength: 0)
                Button { browser.open("/backgammon/play/") } label: { Image(systemName: "dice").frame(width: 48, height: 44) }
                    .accessibilityLabel("Play Backgammon")
                Button { browser.open("/") } label: { Image(systemName: "square.grid.2x2").frame(width: 48, height: 44) }
                    .accessibilityLabel("All projects")
                Spacer(minLength: 0)
                Menu {
                    Button("Offline library", systemImage: "internaldrive") { showLibrary = true }
                    ShareLink(item: browser.publicURL) { Label("Share page link", systemImage: "square.and.arrow.up") }
                    Button("Reload page", systemImage: "arrow.clockwise") { browser.webView.reload() }
                } label: { Image(systemName: "ellipsis.circle").frame(width: 48, height: 44) }
                    .accessibilityLabel("App menu")
            }
            .font(.system(size: 19)).padding(.horizontal, 8)
            .background(.bar).overlay(alignment: .top) { Divider() }
        }
        .background(Color(red: 0.04, green: 0.055, blue: 0.07))
        .preferredColorScheme(.dark)
        .tint(Color(red: 0.56, green: 0.85, blue: 0.71))
        .task { browser.start() }
        .sheet(isPresented: $showLibrary) { LibraryView(browser: browser) }
        .sheet(item: $browser.shareFile, onDismiss: cleanExport) { file in ShareSheet(url: file.url) }
        .alert("Couldn’t complete that action", isPresented: Binding(get: { browser.error != nil }, set: { if !$0 { browser.error = nil } })) {
            Button(browser.ready ? "Reload" : "Retry") {
                browser.error = nil
                if browser.ready { browser.webView.reload() } else { browser.start() }
            }
            Button("Dismiss", role: .cancel) { browser.error = nil }
        } message: { Text(browser.error ?? "") }
    }
    private func cleanExport() {
        // UUID directories avoid overwriting existing exports; the OS reclaims temp files.
        browser.shareFile = nil
    }
}

struct SiteWebView: UIViewRepresentable {
    let webView: WKWebView
    func makeUIView(context: Context) -> WKWebView { webView }
    func updateUIView(_ uiView: WKWebView, context: Context) {}
}

private struct ShareSheet: UIViewControllerRepresentable {
    let url: URL
    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: [url], applicationActivities: nil)
    }
    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}

private struct LibraryView: View {
    @ObservedObject var browser: SiteBrowser
    @Environment(\.dismiss) private var dismiss
    private let destinations: [(String, String, String)] = [
        ("Backgammon", "dice", "/backgammon/"), ("Poker", "suit.spade", "/poker/"),
        ("Blackjack", "suit.club", "/blackjack/"), ("Open-face Chinese", "suit.diamond", "/ofc/"),
        ("Dice", "die.face.5", "/dice/"), ("Scoundrel", "flame", "/scoundrel/"),
        ("Card Table", "rectangle.on.rectangle", "/cards/"), ("Gym Tracker", "dumbbell", "/gym/"),
        ("Music", "music.note", "/music/"), ("Games", "gamecontroller", "/games/"),
        ("Tools", "wrench.and.screwdriver", "/tools/")
    ]
    private var info: BundleInfo? {
        guard let url = Bundle.main.url(forResource: "bundle-info", withExtension: "json", subdirectory: "Site"),
              let data = try? Data(contentsOf: url) else { return nil }
        return try? JSONDecoder().decode(BundleInfo.self, from: data)
    }
    var body: some View {
        NavigationStack {
            List {
                Section {
                    Label("Ready without a connection", systemImage: "checkmark.circle")
                        .foregroundStyle(.mint)
                    if let info {
                        Text("\(info.pages) pages · \(ByteCountFormatter.string(fromByteCount: Int64(info.bytes), countStyle: .file)) on your device")
                            .font(.subheadline).foregroundStyle(.secondary)
                    }
                } footer: {
                    Text("Games, the backgammon engine, and project tools are included in the app. Saved games and settings stay on this device.")
                }
                Section("Projects") {
                    ForEach(destinations, id: \.0) { name, icon, route in
                        Button { browser.open(route); dismiss() } label: { Label(name, systemImage: icon) }
                    }
                }
                Section("Internet features") {
                    Text("Multiplayer rooms, external websites, and some embedded media need a connection.")
                }
                Section("App updates & backups") {
                    Text("Install a new app build to update bundled pages. Website updates do not replace this copy. Browser saves are separate; use Backgammon’s Library to export or import a backup with Files.")
                    if let info { Text("Bundled revision \(info.revision)").font(.caption).foregroundStyle(.secondary) }
                    Button("Engine licenses & source") { browser.open("/native-licenses.html"); dismiss() }
                }
            }
            .navigationTitle("Offline library")
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done") { dismiss() } } }
        }
    }
}

private struct BundleInfo: Decodable { let revision: String; let pages: Int; let bytes: Int }
