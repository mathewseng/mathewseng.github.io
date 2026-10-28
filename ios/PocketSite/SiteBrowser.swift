import SwiftUI
import WebKit

@MainActor
final class SiteBrowser: NSObject, ObservableObject, WKNavigationDelegate, WKUIDelegate, WKDownloadDelegate {
    @Published var ready = false
    @Published var error: String?
    @Published var canGoBack = false
    @Published var canGoForward = false
    @Published var title = "Backgammon"
    @Published var shareFile: SharedFile?
    let webView: WKWebView
    let server: LocalSiteServer
    private var observations: [NSKeyValueObservation] = []
    private var downloads: [ObjectIdentifier: URL] = [:]
    private var started = false

    override init() {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = .default()
        configuration.allowsInlineMediaPlayback = true
        webView = WKWebView(frame: .zero, configuration: configuration)
        server = LocalSiteServer(root: Bundle.main.url(forResource: "Site", withExtension: nil)!)
        super.init()
        webView.navigationDelegate = self
        webView.uiDelegate = self
        webView.allowsBackForwardNavigationGestures = true
        webView.isInspectable = _isDebugAssertConfiguration()
        webView.isOpaque = false
        webView.backgroundColor = UIColor(red: 0.04, green: 0.055, blue: 0.07, alpha: 1)
        webView.scrollView.backgroundColor = webView.backgroundColor
        observations = [
            webView.observe(\.canGoBack, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoBack = view.canGoBack }
            },
            webView.observe(\.canGoForward, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.canGoForward = view.canGoForward }
            },
            webView.observe(\.title, options: [.new]) { [weak self] view, _ in
                Task { @MainActor in self?.title = view.title ?? "Pocket Site" }
            }
        ]
    }

    func start() {
        guard !started else { return }
        started = true
        server.start { [weak self] result in
            Task { @MainActor in
                guard let self else { return }
                switch result {
                case .success:
                    self.ready = true
                    self.open(UserDefaults.standard.string(forKey: "lastLocalRoute") ?? "/backgammon/play/")
                case .failure(let failure):
                    self.error = "The offline library couldn’t open. \(failure.localizedDescription)"
                    self.started = false
                    self.server.stop()
                }
            }
        }
    }

    func open(_ route: String) {
        guard let url = URL(string: route, relativeTo: LocalSiteServer.origin)?.absoluteURL,
              isLocal(url) else { return }
        webView.load(URLRequest(url: url))
    }

    func isLocal(_ url: URL) -> Bool {
        url.scheme == "http" && url.host == "127.0.0.1" && url.port == Int(LocalSiteServer.port)
    }

    var publicURL: URL {
        var components = URLComponents(url: webView.url ?? LocalSiteServer.origin, resolvingAgainstBaseURL: false)!
        components.scheme = "https"; components.host = "mathewseng.github.io"; components.port = nil
        return components.url!
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        error = nil
        if let url = webView.url, isLocal(url), let components = URLComponents(url: url, resolvingAgainstBaseURL: false) {
            let route = components.percentEncodedPath + (components.percentEncodedQuery.map { "?" + $0 } ?? "") + (components.percentEncodedFragment.map { "#" + $0 } ?? "")
            UserDefaults.standard.set(route, forKey: "lastLocalRoute")
        }
    }

    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        if (error as NSError).code != NSURLErrorCancelled { self.error = error.localizedDescription }
    }

    func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { webView.reload() }

    func webView(_ webView: WKWebView, decidePolicyFor action: WKNavigationAction, decisionHandler: @escaping (WKNavigationActionPolicy) -> Void) {
        guard let url = action.request.url else { decisionHandler(.cancel); return }
        if action.shouldPerformDownload { decisionHandler(.download); return }
        if isLocal(url) || ["blob", "about"].contains(url.scheme ?? "") {
            decisionHandler(.allow)
        } else if url.host == "mathewseng.github.io", ["https", "http"].contains(url.scheme ?? "") {
            var components = URLComponents(url: url, resolvingAgainstBaseURL: false)!
            components.scheme = "http"; components.host = "127.0.0.1"; components.port = Int(LocalSiteServer.port)
            if let local = components.url { webView.load(URLRequest(url: local)) }
            decisionHandler(.cancel)
        } else {
            if ["https", "http", "mailto"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
            decisionHandler(.cancel)
        }
    }

    func webView(_ webView: WKWebView, decidePolicyFor response: WKNavigationResponse, decisionHandler: @escaping (WKNavigationResponsePolicy) -> Void) {
        decisionHandler(response.canShowMIMEType ? .allow : .download)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for action: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        if let url = action.request.url, isLocal(url) { webView.load(action.request) }
        else if let url = action.request.url, ["http", "https"].contains(url.scheme ?? "") { UIApplication.shared.open(url) }
        return nil
    }

    func webView(_ webView: WKWebView, navigationAction: WKNavigationAction, didBecome download: WKDownload) { download.delegate = self }
    func webView(_ webView: WKWebView, navigationResponse: WKNavigationResponse, didBecome download: WKDownload) { download.delegate = self }

    func download(_ download: WKDownload, decideDestinationUsing response: URLResponse, suggestedFilename: String, completionHandler: @escaping (URL?) -> Void) {
        do {
            let directory = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
            try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
            let name = (suggestedFilename as NSString).lastPathComponent
            let file = directory.appendingPathComponent(name.isEmpty ? "export.json" : name)
            downloads[ObjectIdentifier(download)] = file
            completionHandler(file)
        } catch { self.error = error.localizedDescription; completionHandler(nil) }
    }

    func downloadDidFinish(_ download: WKDownload) {
        if let url = downloads.removeValue(forKey: ObjectIdentifier(download)) { shareFile = SharedFile(url: url) }
    }

    func download(_ download: WKDownload, didFailWithError error: Error, resumeData: Data?) {
        if let file = downloads.removeValue(forKey: ObjectIdentifier(download)) { try? FileManager.default.removeItem(at: file.deletingLastPathComponent()) }
        self.error = "Couldn’t export this file. \(error.localizedDescription)"
    }

    // Preserve existing site confirmation/prompt flows in WKWebView.
    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        presenter?.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let alert = UIAlertController(title: nil, message: message, preferredStyle: .alert)
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(false) })
        alert.addAction(UIAlertAction(title: "Continue", style: .default) { _ in completionHandler(true) })
        presenter?.present(alert, animated: true)
    }
    func webView(_ webView: WKWebView, runJavaScriptTextInputPanelWithPrompt prompt: String, defaultText: String?, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (String?) -> Void) {
        let alert = UIAlertController(title: nil, message: prompt, preferredStyle: .alert)
        alert.addTextField { $0.text = defaultText }
        alert.addAction(UIAlertAction(title: "Cancel", style: .cancel) { _ in completionHandler(nil) })
        alert.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(alert.textFields?.first?.text) })
        presenter?.present(alert, animated: true)
    }
    private var presenter: UIViewController? {
        var current = webView.window?.rootViewController
        while let presented = current?.presentedViewController { current = presented }
        return current
    }
}

struct SharedFile: Identifiable { let id = UUID(); let url: URL }
