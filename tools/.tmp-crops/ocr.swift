import Foundation
import Vision
import AppKit
let cg = NSImage(contentsOfFile: CommandLine.arguments[1])!.cgImage(forProposedRect: nil, context: nil, hints: nil)!
let r = VNRecognizeTextRequest()
r.recognitionLanguages = ["zh-Hans","en-US"]
r.recognitionLevel = .accurate
try? VNImageRequestHandler(cgImage: cg, options: [:]).perform([r])
var o: [(Double,String)] = []
for x in r.results ?? [] { if let c = x.topCandidates(1).first { o.append((Double(x.boundingBox.midY), c.string)) } }
o.sort { $0.0 > $1.0 }
for x in o { print(String(format: "%.3f", x.0) + " " + x.1) }
