import Foundation
import Network

/// A fixed loopback origin preserves IndexedDB/localStorage across launches and
/// provides real HTTP semantics for ES modules, Web Workers, crypto and WASM.
final class LocalSiteServer {
    static let port: UInt16 = 18973
    static let origin = URL(string: "http://127.0.0.1:\(port)")!
    private let root: URL
    private let queue = DispatchQueue(label: "site.loopback", qos: .userInitiated)
    private var listener: NWListener?
    private var connections: [UUID: NWConnection] = [:]

    init(root: URL) { self.root = root }

    func start(completion: @escaping (Result<Void, Error>) -> Void) {
        guard listener == nil else { completion(.success(())); return }
        do {
            let parameters = NWParameters.tcp
            parameters.requiredLocalEndpoint = .hostPort(host: "127.0.0.1", port: NWEndpoint.Port(rawValue: Self.port)!)
            parameters.allowLocalEndpointReuse = true
            let listener = try NWListener(using: parameters)
            self.listener = listener
            var reported = false
            listener.stateUpdateHandler = { state in
                switch state {
                case .ready:
                    if !reported { reported = true; completion(.success(())) }
                case .failed(let error):
                    if !reported { reported = true; completion(.failure(error)) }
                default: break
                }
            }
            listener.newConnectionHandler = { [weak self] connection in self?.accept(connection) }
            listener.start(queue: queue)
        } catch { completion(.failure(error)) }
    }

    func stop() {
        listener?.cancel()
        listener = nil
        queue.async { [self] in
            for connection in connections.values { connection.cancel() }
            connections.removeAll()
        }
    }

    private func accept(_ connection: NWConnection) {
        let id = UUID()
        connections[id] = connection
        connection.stateUpdateHandler = { [weak self] state in
            if case .cancelled = state { self?.connections.removeValue(forKey: id) }
            if case .failed = state { connection.cancel() }
        }
        connection.start(queue: queue)
        queue.asyncAfter(deadline: .now() + 30) { connection.cancel() }
        receive(connection, buffer: Data())
    }

    private func receive(_ connection: NWConnection, buffer: Data) {
        connection.receive(minimumIncompleteLength: 1, maximumLength: 16384) { [weak self] data, _, complete, error in
            guard let self else { connection.cancel(); return }
            var buffer = buffer
            if let data { buffer.append(data) }
            if let end = buffer.range(of: Data("\r\n\r\n".utf8)) {
                let request = String(decoding: buffer[..<end.lowerBound], as: UTF8.self)
                let response = SiteResponse(request: request, root: self.root)
                connection.send(content: response.header, completion: .contentProcessed { error in
                    if error != nil { connection.cancel(); return }
                    self.send(response.body, offset: 0, to: connection)
                })
            } else if buffer.count >= 16384 || complete || error != nil {
                connection.cancel()
            } else { self.receive(connection, buffer: buffer) }
        }
    }

    private func send(_ body: Data, offset: Int, to connection: NWConnection) {
        guard offset < body.count else { connection.cancel(); return }
        let end = min(offset + 256 * 1024, body.count)
        connection.send(content: body.subdata(in: offset..<end), completion: .contentProcessed { [weak self] error in
            guard error == nil, let self else { connection.cancel(); return }
            self.send(body, offset: end, to: connection)
        })
    }
}

struct SiteResponse {
    let status: Int
    let header: Data
    let body: Data

    init(request: String, root: URL) {
        let lines = request.components(separatedBy: "\r\n")
        let parts = (lines.first ?? "").split(separator: " ")
        let method = parts.first.map(String.init) ?? ""
        var headers: [String: String] = [:]
        for line in lines.dropFirst() {
            if let colon = line.firstIndex(of: ":") {
                headers[String(line[..<colon]).lowercased()] = line[line.index(after: colon)...].trimmingCharacters(in: .whitespaces)
            }
        }
        var code = 200, payload = Data(), type = "text/plain; charset=utf-8"
        var extra = ""
        let target = parts.count >= 2 ? String(parts[1]) : ""
        let path = target.split(separator: "?", maxSplits: 1).first.map(String.init)?.removingPercentEncoding
        let host = headers["host"] ?? ""
        if !["127.0.0.1:\(LocalSiteServer.port)", "localhost:\(LocalSiteServer.port)"].contains(host) {
            code = 403
        } else if !["GET", "HEAD"].contains(method) {
            code = 405; extra = "Allow: GET, HEAD\r\n"
        } else if let path, path.hasPrefix("/"), !path.contains("\0"), !path.contains("\\"),
                  !path.split(separator: "/").contains("..") {
            let base = root.resolvingSymlinksInPath().standardizedFileURL.path
            var file = root.appendingPathComponent(String(path.dropFirst())).resolvingSymlinksInPath().standardizedFileURL
            var directory: ObjCBool = false
            if FileManager.default.fileExists(atPath: file.path, isDirectory: &directory), directory.boolValue {
                if !path.hasSuffix("/") {
                    code = 301
                    // Preserve query strings on directory redirects.
                    let query = target.firstIndex(of: "?").map { String(target[$0...]) } ?? ""
                    let escaped = String(target.split(separator: "?", maxSplits: 1)[0])
                    extra = "Location: \(escaped)/\(query)\r\n"
                }
                file.appendPathComponent("index.html")
            }
            if !file.path.hasPrefix(base + "/") { code = 403 }
            else if code == 200 {
                if let data = try? Data(contentsOf: file, options: .mappedIfSafe) {
                    payload = data
                    type = Self.mime[file.pathExtension.lowercased()] ?? "application/octet-stream"
                    extra += "Accept-Ranges: bytes\r\n"
                    if let range = headers["range"] {
                        let total = data.count
                        if let bounds = Self.byteRange(range, count: total) {
                            code = 206; payload = data.subdata(in: bounds)
                            extra += "Content-Range: bytes \(bounds.lowerBound)-\(bounds.upperBound - 1)/\(total)\r\n"
                        } else { code = 416; payload = Data(); extra += "Content-Range: bytes */\(total)\r\n" }
                    }
                } else { code = 404 }
            }
        } else { code = 403 }
        if code >= 400 && code != 416 { payload = Data("\(code) \(Self.reasons[code] ?? "Error")".utf8) }
        status = code
        body = method == "HEAD" ? Data() : payload
        header = Data(("HTTP/1.1 \(code) \(Self.reasons[code] ?? "OK")\r\n" +
            "Content-Type: \(type)\r\nContent-Length: \(payload.count)\r\n" +
            "Connection: close\r\nCache-Control: no-store\r\nX-Content-Type-Options: nosniff\r\n" + extra + "\r\n").utf8)
    }

    static func byteRange(_ value: String, count: Int) -> Range<Int>? {
        guard value.hasPrefix("bytes="), count > 0 else { return nil }
        let parts = value.dropFirst(6).split(separator: "-", omittingEmptySubsequences: false)
        guard parts.count == 2 else { return nil }
        if parts[0].isEmpty, let suffix = Int(parts[1]), suffix > 0 { return max(0, count - suffix)..<count }
        guard let start = Int(parts[0]), start >= 0, start < count else { return nil }
        let last = parts[1].isEmpty ? count - 1 : Int(parts[1]) ?? -1
        guard last >= start else { return nil }
        return start..<(min(last, count - 1) + 1)
    }

    static let reasons = [200: "OK", 206: "Partial Content", 301: "Moved Permanently", 403: "Forbidden", 404: "Not Found", 405: "Method Not Allowed", 416: "Range Not Satisfiable"]
    static let mime = ["html": "text/html; charset=utf-8", "js": "text/javascript; charset=utf-8", "mjs": "text/javascript; charset=utf-8", "css": "text/css; charset=utf-8", "json": "application/json", "webmanifest": "application/manifest+json", "wasm": "application/wasm", "svg": "image/svg+xml", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg", "webp": "image/webp", "gif": "image/gif", "ico": "image/x-icon", "woff": "font/woff", "woff2": "font/woff2", "ttf": "font/ttf", "mp3": "audio/mpeg", "wav": "audio/wav", "ogg": "audio/ogg", "mp4": "video/mp4", "pdf": "application/pdf", "txt": "text/plain; charset=utf-8", "gz": "application/gzip", "csv": "text/csv; charset=utf-8"]
}
