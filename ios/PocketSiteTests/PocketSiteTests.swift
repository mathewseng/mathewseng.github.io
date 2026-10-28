import XCTest
import WebKit
import Combine
@testable import PocketSite

final class PocketSiteTests: XCTestCase {
    private var root: URL { Bundle.main.url(forResource: "Site", withExtension: nil)! }
    private func response(_ target: String, method: String = "GET", extra: String = "") -> SiteResponse {
        SiteResponse(request: "\(method) \(target) HTTP/1.1\r\nHost: 127.0.0.1:\(LocalSiteServer.port)\r\n\(extra)", root: root)
    }

    func testPublishedBundleAndHTTP() throws {
        for route in ["/", "/backgammon/play/", "/backgammon/solver/", "/backgammon/trainer/", "/backgammon/library/", "/gym/", "/poker/", "/music/", "/games/", "/tools/"] {
            let result = response(route)
            XCTAssertEqual(result.status, 200, route)
            XCTAssertTrue(String(decoding: result.body, as: UTF8.self).contains("native-adapter.js"), route)
        }
        let get = response("/backgammon/engine/vendor/gnubg-core-module.wasm?bgv=test")
        XCTAssertEqual(get.status, 200)
        XCTAssertEqual(Array(get.body.prefix(4)), [0, 97, 115, 109])
        XCTAssertTrue(String(decoding: get.header, as: UTF8.self).contains("application/wasm"))
        XCTAssertEqual(response("/backgammon", extra: "").status, 301)
        let head = response("/backgammon/engine/vendor/gnubg-core-module.wasm", method: "HEAD")
        XCTAssertEqual(head.status, 200)
        XCTAssertTrue(head.body.isEmpty)
        XCTAssertTrue(String(decoding: head.header, as: UTF8.self).contains("Content-Length: \(get.body.count)"))
        let partial = response("/backgammon/engine/vendor/gnubg-core-module.wasm", extra: "Range: bytes=0-3\r\n")
        XCTAssertEqual(partial.status, 206)
        XCTAssertEqual(partial.body, get.body.prefix(4))
        XCTAssertEqual(response("/backgammon/engine/vendor/gnubg-core-module.wasm", extra: "Range: bytes=999999999-\r\n").status, 416)
        XCTAssertEqual(response("/does-not-exist").status, 404)
        XCTAssertEqual(response("/%2e%2e/Info.plist").status, 403)
        XCTAssertEqual(response("/../Info.plist").status, 403)
        XCTAssertEqual(response("/", method: "POST").status, 405)
        XCTAssertEqual(SiteResponse(request: "GET / HTTP/1.1\r\nHost: attacker.example", root: root).status, 403)
    }

    func testSymlinkEscapeAndRangeEdges() throws {
        let folder = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
        defer { try? FileManager.default.removeItem(at: folder) }
        let site = folder.appendingPathComponent("site")
        try FileManager.default.createDirectory(at: site, withIntermediateDirectories: true)
        let outside = folder.appendingPathComponent("outside.txt")
        try Data("private".utf8).write(to: outside)
        try FileManager.default.createSymbolicLink(at: site.appendingPathComponent("escape.txt"), withDestinationURL: outside)
        let result = SiteResponse(request: "GET /escape.txt HTTP/1.1\r\nHost: 127.0.0.1:\(LocalSiteServer.port)", root: site)
        XCTAssertEqual(result.status, 403)
        XCTAssertEqual(SiteResponse.byteRange("bytes=-3", count: 10), 7..<10)
        XCTAssertEqual(SiteResponse.byteRange("bytes=8-99", count: 10), 8..<10)
        XCTAssertNil(SiteResponse.byteRange("bytes=1-0", count: 10))
        XCTAssertNil(SiteResponse.byteRange("bytes=0-1,3-4", count: 10))
    }

    @MainActor
    func testBlobBackupExportUsesNativeDownload() async throws {
        let browser = SiteBrowser()
        let waiter = NavigationWaiter()
        let loaded = expectation(description: "Export page loaded")
        waiter.loaded = { loaded.fulfill() }
        // Wait for the real page before returning download handling to SiteBrowser.
        browser.webView.navigationDelegate = waiter
        browser.open("/backgammon/")
        await fulfillment(of: [loaded], timeout: 20)
        browser.webView.navigationDelegate = browser
        let exported = expectation(description: "Blob backup offered to iOS share sheet")
        var output: URL?
        let observation = browser.$shareFile.compactMap { $0 }.sink { file in
            output = file.url; exported.fulfill()
        }
        defer { observation.cancel() }
        _ = try await browser.webView.evaluateJavaScript(#"""
            (() => {
                const link = document.createElement('a');
                link.href = URL.createObjectURL(new Blob(['{"backup":"native-ios"}'], {type:'application/json'}));
                link.download = 'backgammon-ios-test.json';
                document.body.append(link); link.click(); link.remove();
            })()
        """#)
        await fulfillment(of: [exported], timeout: 20)
        let url = try XCTUnwrap(output)
        defer { try? FileManager.default.removeItem(at: url.deletingLastPathComponent()) }
        XCTAssertEqual(url.lastPathComponent, "backgammon-ios-test.json")
        XCTAssertEqual(try String(contentsOf: url, encoding: .utf8), #"{"backup":"native-ios"}"#)
    }

    @MainActor
    func testRealEngineAndStorageWithExternalRequestsBlocked() async throws {
        // A real WKWebView, not Playwright WebKit. Every non-loopback HTTP load
        // is blocked, including a first-run engine or dependency download.
        let rule = #"[{"trigger":{"url-filter":"^https?://","unless-domain":["127.0.0.1","localhost"]},"action":{"type":"block"}}]"#
        let rules = try await WKContentRuleListStore.default().compileContentRuleList(forIdentifier: "offline-test", encodedContentRuleList: rule)
        let configuration = WKWebViewConfiguration()
        configuration.userContentController.add(rules!)
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 390, height: 700), configuration: configuration)
        let waiter = NavigationWaiter()
        webView.navigationDelegate = waiter
        let loaded = expectation(description: "Bundled page loaded")
        waiter.loaded = { loaded.fulfill() }
        webView.load(URLRequest(url: LocalSiteServer.origin.appendingPathComponent("backgammon/")))
        await fulfillment(of: [loaded], timeout: 20)
        let result = try await webView.callAsyncJavaScript(#"""
            if (!isSecureContext || !crypto.subtle) throw Error('Secure local origin required');
            if ('serviceWorker' in navigator) throw Error('Website update worker must be disabled');
            const {EngineClient} = await import('/backgammon/engine/client.mjs');
            const {initialState} = await import('/backgammon/core/rules.mjs');
            const client = new EngineClient({openingBook: null});
            try {
                await client.start();
                const state = initialState({phase:'move', dice:[3,1], matchLength:0});
                const score = await client.analyze(state, {preset:'quick'});
                if (!score.candidates?.length || !Number.isFinite(score.candidates[0].equity)) throw Error('No legal scored move');
                const {put,get} = await import('/backgammon/core/storage.mjs');
                await put('work', {id:'ios-offline-smoke', state});
                localStorage.setItem('ios-offline-smoke', 'persisted');
                const saved = await get('work', 'ios-offline-smoke');
                if (JSON.stringify(saved.state) !== JSON.stringify(state)) throw Error('IndexedDB save failed');
                return {candidates:score.candidates.length, backend:client.startup.backend, equity:score.candidates[0].equity};
            } finally { client.destroy(); }
        """#, arguments: [:], in: nil, contentWorld: .page)
        let report = try XCTUnwrap(result as? [String: Any])
        XCTAssertGreaterThan(try XCTUnwrap(report["candidates"] as? Int), 0)
        print("Offline iOS GNUbg result: \(report)")
        let reloaded = expectation(description: "Reloaded offline")
        waiter.loaded = { reloaded.fulfill() }
        webView.reload()
        await fulfillment(of: [reloaded], timeout: 20)
        let retained = try await webView.callAsyncJavaScript(#"""
            const {get,remove} = await import('/backgammon/core/storage.mjs');
            const saved = await get('work', 'ios-offline-smoke');
            const valid = saved.state.dice.join(',') === '3,1' && localStorage.getItem('ios-offline-smoke') === 'persisted';
            await remove('work', 'ios-offline-smoke');
            localStorage.removeItem('ios-offline-smoke');
            return valid;
        """#, arguments: [:], in: nil, contentWorld: .page)
        XCTAssertEqual(retained as? Bool, true)
    }
}

@MainActor
private final class NavigationWaiter: NSObject, WKNavigationDelegate {
    var loaded: (() -> Void)?
    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) { loaded?() }
}
