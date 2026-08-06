import Flutter
import AVFoundation
import ImageIO

public class NativeVideoEditorPlugin: NSObject, FlutterPlugin {
    private var isDetached = false
    private var currentExportSession: AVAssetExportSession?
    private var exportCancellationResult: FlutterResult?
    private var progressEventSink: FlutterEventSink?
    private var progressTimer: Timer?
    private var frameGenerators: [String: AVAssetImageGenerator] = [:]
    private var frameOutputPaths: [String: [String]] = [:]
    private var cancelledFrameRequests = Set<String>()
    private var frameCancellationResults: [String: FlutterResult] = [:]
    private let frameStartQueue = DispatchQueue(
        label: "io.ente.native-video-editor.frames"
    )
    private let frameSemaphore = DispatchSemaphore(value: 2)

    public static func register(with registrar: FlutterPluginRegistrar) {
        let channel = FlutterMethodChannel(name: "native_video_editor", binaryMessenger: registrar.messenger())
        let instance = NativeVideoEditorPlugin()
        registrar.addMethodCallDelegate(instance, channel: channel)
        registrar.publish(instance)

        let progressChannel = FlutterEventChannel(name: "native_video_editor/progress", binaryMessenger: registrar.messenger())
        progressChannel.setStreamHandler(instance)
    }

    public func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
        switch call.method {
        case "processVideo":
            handleProcessVideo(call: call, result: result)

        case "getVideoInfo":
            guard let args = call.arguments as? [String: Any],
                  let videoPath = args["videoPath"] as? String else {
            result(flutterError("INVALID_ARGS", message: "Invalid arguments"))
            return
        }

        getVideoInfo(videoPath: videoPath, result: result)

        case "extractFrame":
            guard let args = call.arguments as? [String: Any],
                  let outputPath = args["outputPath"] as? String,
                  let position = args["positionMs"] as? NSNumber else {
                result(flutterError("INVALID_ARGS", message: "Invalid frame arguments"))
                return
            }
            extractFrames(
                args: args,
                requestID: UUID().uuidString,
                outputPaths: [outputPath],
                positionsMs: [position.int64Value],
                result: result
            )

        case "extractTimeline":
            guard let args = call.arguments as? [String: Any],
                  let requestID = args["requestId"] as? String,
                  let outputPaths = args["outputPaths"] as? [String],
                  let positions = args["positionsMs"] as? [NSNumber] else {
                result(flutterError("INVALID_ARGS", message: "Invalid timeline arguments"))
                return
            }
            extractFrames(
                args: args,
                requestID: requestID,
                outputPaths: outputPaths,
                positionsMs: positions.map(\.int64Value),
                result: result
            )

        case "cancelFrameExtraction":
            guard let args = call.arguments as? [String: Any],
                  let requestID = args["requestId"] as? String else {
                result(flutterError("INVALID_ARGS", message: "Missing frame request ID"))
                return
            }
            if let generator = frameGenerators[requestID] {
                cancelledFrameRequests.insert(requestID)
                if frameCancellationResults[requestID] != nil {
                    result(nil)
                    return
                }
                frameCancellationResults[requestID] = result
                generator.cancelAllCGImageGeneration()
            } else {
                result(nil)
            }

        case "cancelProcessing":
            guard let exportSession = currentExportSession else {
                result(nil)
                return
            }
            guard exportCancellationResult == nil else {
                result(nil)
                return
            }
            exportCancellationResult = result
            exportSession.cancelExport()

        default:
            result(FlutterMethodNotImplemented)
        }
    }

    private func extractFrames(
        args: [String: Any],
        requestID: String,
        outputPaths: [String],
        positionsMs: [Int64],
        result: @escaping FlutterResult
    ) {
        guard frameGenerators[requestID] == nil else {
            result(flutterError("DUPLICATE_REQUEST", message: "Frame request ID is already active"))
            return
        }
        guard let inputPath = args["inputPath"] as? String,
              let maxWidth = args["maxWidth"] as? NSNumber,
              let maxHeight = args["maxHeight"] as? NSNumber,
              let quality = args["quality"] as? NSNumber,
              let policy = args["policy"] as? String,
              !positionsMs.isEmpty,
              positionsMs.count == outputPaths.count,
              maxWidth.intValue > 0,
              maxHeight.intValue > 0,
              (1...100).contains(quality.intValue),
              policy == "precise" || policy == "nearestSync" else {
            result(flutterError("INVALID_ARGS", message: "Invalid frame extraction arguments"))
            return
        }
        let inputURL = URL(fileURLWithPath: inputPath)
            .standardizedFileURL.resolvingSymlinksInPath()
        let outputURLs = outputPaths.map {
            URL(fileURLWithPath: $0).standardizedFileURL.resolvingSymlinksInPath()
        }
        guard FileManager.default.fileExists(atPath: inputURL.path),
              positionsMs.allSatisfy({ $0 >= 0 }),
              outputPaths.allSatisfy({ !$0.isEmpty }),
              !outputURLs.contains(inputURL),
              Set(outputURLs.map(\.path)).count == outputURLs.count else {
            result(flutterError("INVALID_ARGS", message: "Invalid frame paths or timestamps"))
            return
        }

        let asset = AVURLAsset(url: inputURL)
        let generator = AVAssetImageGenerator(asset: asset)
        generator.appliesPreferredTrackTransform = true
        generator.maximumSize = CGSize(
            width: maxWidth.doubleValue,
            height: maxHeight.doubleValue
        )
        if policy == "precise" {
            generator.requestedTimeToleranceBefore = .zero
            generator.requestedTimeToleranceAfter = .zero
        } else {
            let tolerance = CMTime(value: 300, timescale: 600)
            generator.requestedTimeToleranceBefore = tolerance
            generator.requestedTimeToleranceAfter = tolerance
        }

        cancelledFrameRequests.remove(requestID)
        frameGenerators[requestID] = generator
        frameOutputPaths[requestID] = outputPaths
        frameStartQueue.async { [weak self] in
            guard let self = self else { return }
            self.frameSemaphore.wait()
            DispatchQueue.main.async {
                if self.cancelledFrameRequests.contains(requestID) {
                    self.finishFrameRequest(
                        requestID: requestID,
                        generator: generator,
                        result: result,
                        value: self.flutterError("FRAME_CANCELLED", message: "Frame extraction was cancelled")
                    )
                    return
                }
                self.loadVideoInfo(asset: asset) { [weak self] loadedInfo in
                    guard let self = self else { return }
                    DispatchQueue.main.async {
                        switch loadedInfo {
                        case .success(let info):
                            let durationMs = info["duration"] as? Int64 ?? 0
                            self.generateFrame(
                                generator: generator,
                                requestID: requestID,
                                outputPaths: outputPaths,
                                positionsMs: positionsMs,
                                durationMs: durationMs,
                                quality: quality.doubleValue / 100.0,
                                index: 0,
                                frames: [],
                                videoInfo: info,
                                result: result
                            )
                        case .failure(let error):
                            self.finishFrameRequest(
                                requestID: requestID,
                                generator: generator,
                                result: result,
                                value: self.flutterError("FRAME_EXTRACTION_ERROR", message: "Failed to inspect video", error: error)
                            )
                        }
                    }
                }
            }
        }
    }

    private func generateFrame(
        generator: AVAssetImageGenerator,
        requestID: String,
        outputPaths: [String],
        positionsMs: [Int64],
        durationMs: Int64,
        quality: Double,
        index: Int,
        frames: [[String: Any]],
        videoInfo: [String: Any],
        result: @escaping FlutterResult
    ) {
        if cancelledFrameRequests.contains(requestID) {
            removeFiles(at: outputPaths.prefix(index))
            finishFrameRequest(
                requestID: requestID,
                generator: generator,
                result: result,
                value: flutterError("FRAME_CANCELLED", message: "Frame extraction was cancelled")
            )
            return
        }

        let upperBound = max(Int64(0), durationMs - 1)
        let positionMs = durationMs > 0
            ? min(max(Int64(0), positionsMs[index]), upperBound)
            : max(Int64(0), positionsMs[index])
        let requestedTime = CMTime(value: positionMs, timescale: 1000)

        generator.generateCGImagesAsynchronously(forTimes: [NSValue(time: requestedTime)]) {
            [weak self] _, image, _, generationResult, error in
            guard let self = self else { return }
            guard generationResult == .succeeded, let image = image else {
                DispatchQueue.main.async {
                    self.removeFiles(at: outputPaths.prefix(index))
                    let code = generationResult == .cancelled
                        ? "FRAME_CANCELLED"
                        : "FRAME_EXTRACTION_ERROR"
                    self.finishFrameRequest(
                        requestID: requestID,
                        generator: generator,
                        result: result,
                        value: self.flutterError(code, message: "Failed to decode video frame", error: error)
                    )
                }
                return
            }

            do {
                try self.writeJPEG(image, to: outputPaths[index], quality: quality)
                DispatchQueue.main.async {
                    if self.cancelledFrameRequests.contains(requestID) {
                        self.removeFiles(at: outputPaths.prefix(index + 1))
                        self.finishFrameRequest(
                            requestID: requestID,
                            generator: generator,
                            result: result,
                            value: self.flutterError(
                                "FRAME_CANCELLED",
                                message: "Frame extraction was cancelled"
                            )
                        )
                        return
                    }
                    var nextFrames = frames
                    nextFrames.append([
                        "outputPath": outputPaths[index],
                        "width": image.width,
                        "height": image.height,
                    ])
                    let nextIndex = index + 1
                    if nextIndex == positionsMs.count {
                        self.finishFrameRequest(
                            requestID: requestID,
                            generator: generator,
                            result: result,
                            value: ["videoInfo": videoInfo, "frames": nextFrames]
                        )
                    } else {
                        self.generateFrame(
                            generator: generator,
                            requestID: requestID,
                            outputPaths: outputPaths,
                            positionsMs: positionsMs,
                            durationMs: durationMs,
                            quality: quality,
                            index: nextIndex,
                            frames: nextFrames,
                            videoInfo: videoInfo,
                            result: result
                        )
                    }
                }
            } catch {
                DispatchQueue.main.async {
                    self.removeFiles(at: outputPaths.prefix(index + 1))
                    self.finishFrameRequest(
                        requestID: requestID,
                        generator: generator,
                        result: result,
                        value: self.flutterError("FRAME_WRITE_ERROR", message: "Failed to write video frame", error: error)
                    )
                }
            }
        }
    }

    private func writeJPEG(_ image: CGImage, to path: String, quality: Double) throws {
        let url = URL(fileURLWithPath: path)
        try FileManager.default.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try? FileManager.default.removeItem(at: url)
        guard let destination = CGImageDestinationCreateWithURL(
            url as CFURL,
            "public.jpeg" as CFString,
            1,
            nil
        ) else {
            throw NSError(
                domain: "NativeVideoEditor",
                code: 3,
                userInfo: [NSLocalizedDescriptionKey: "Could not create JPEG destination"]
            )
        }
        let properties = [kCGImageDestinationLossyCompressionQuality: quality] as CFDictionary
        CGImageDestinationAddImage(destination, image, properties)
        if !CGImageDestinationFinalize(destination) {
            throw NSError(
                domain: "NativeVideoEditor",
                code: 4,
                userInfo: [NSLocalizedDescriptionKey: "Could not finalize JPEG output"]
            )
        }
    }

    private func finishFrameRequest(
        requestID: String,
        generator: AVAssetImageGenerator,
        result: @escaping FlutterResult,
        value: Any
    ) {
        guard let activeGenerator = frameGenerators[requestID],
              activeGenerator === generator else { return }
        frameGenerators.removeValue(forKey: requestID)
        frameOutputPaths.removeValue(forKey: requestID)
        cancelledFrameRequests.remove(requestID)
        frameSemaphore.signal()
        let cancellationResult = frameCancellationResults.removeValue(forKey: requestID)
        if !isDetached {
            result(value)
            cancellationResult?(nil)
        }
    }

    private func removeFiles<S: Sequence>(at paths: S) where S.Element == String {
        for path in paths {
            try? FileManager.default.removeItem(atPath: path)
        }
    }

    private func handleProcessVideo(call: FlutterMethodCall, result: @escaping FlutterResult) {
        guard currentExportSession == nil else {
            result(flutterError("CONCURRENT_EXPORT", message: "A video export is already active"))
            return
        }
        guard let args = call.arguments as? [String: Any],
              let inputPath = args["inputPath"] as? String,
              let outputPath = args["outputPath"] as? String else {
            result(flutterError("INVALID_ARGS", message: "Invalid arguments"))
            return
        }
        let trimStartMs = args["trimStartMs"] as? Int
        let trimEndMs = args["trimEndMs"] as? Int
        let rotateDegrees = args["rotateDegrees"] as? Int
        let cropX = args["cropX"] as? Int
        let cropY = args["cropY"] as? Int
        let cropWidth = args["cropWidth"] as? Int
        let cropHeight = args["cropHeight"] as? Int
        let cropValues = [cropX, cropY, cropWidth, cropHeight]
        let inputURL = URL(fileURLWithPath: inputPath)
            .standardizedFileURL.resolvingSymlinksInPath()
        let outputURL = URL(fileURLWithPath: outputPath)
            .standardizedFileURL.resolvingSymlinksInPath()
        guard inputURL != outputURL,
              FileManager.default.fileExists(atPath: inputURL.path),
              (trimStartMs == nil) == (trimEndMs == nil),
              trimStartMs == nil || (trimStartMs! >= 0 && trimStartMs! < trimEndMs!),
              rotateDegrees == nil || [0, 90, 180, 270].contains(rotateDegrees!),
              cropValues.allSatisfy({ $0 == nil }) || cropValues.allSatisfy({ $0 != nil }),
              cropWidth == nil || (cropX! >= 0 && cropY! >= 0 && cropWidth! > 0 && cropHeight! > 0) else {
            result(flutterError("INVALID_ARGS", message: "Invalid video processing arguments"))
            return
        }

        let asset = AVAsset(url: inputURL)
        let composition = AVMutableComposition()
        var videoComposition: AVMutableVideoComposition?

        var requestedTimeRange = CMTimeRange(start: .zero, duration: asset.duration)
        if let trimStartMs, let trimEndMs {
            let startTime = CMTime(value: CMTimeValue(trimStartMs), timescale: 1000)
            let endTime = CMTime(value: CMTimeValue(trimEndMs), timescale: 1000)
            requestedTimeRange = CMTimeRange(start: startTime, end: endTime)
        }

        guard let videoTrack = asset.tracks(withMediaType: .video).first,
              let compositionVideoTrack = composition.addMutableTrack(
                withMediaType: .video,
                preferredTrackID: kCMPersistentTrackID_Invalid) else {
            result(flutterError("COMPOSITION_ERROR", message: "Failed to create composition"))
            return
        }
        guard let videoTimeRange = intersection(
            requestedTimeRange,
            with: videoTrack.timeRange
        ) else {
            result(flutterError("INVALID_TIME_RANGE", message: "The edit range does not contain video"))
            return
        }

        do {
            try compositionVideoTrack.insertTimeRange(videoTimeRange, of: videoTrack, at: .zero)

            if let audioTrack = asset.tracks(withMediaType: .audio).first,
               let audioTimeRange = intersection(videoTimeRange, with: audioTrack.timeRange),
               let compositionAudioTrack = composition.addMutableTrack(
                withMediaType: .audio,
                preferredTrackID: kCMPersistentTrackID_Invalid) {
                let insertionTime = CMTimeSubtract(audioTimeRange.start, videoTimeRange.start)
                try compositionAudioTrack.insertTimeRange(
                    audioTimeRange,
                    of: audioTrack,
                    at: insertionTime
                )
            }
        } catch {
            result(flutterError("INSERT_ERROR", message: "Failed to insert track", error: error))
            return
        }

        var isReEncoded = false

        let naturalSize = videoTrack.naturalSize
        let preferredTransform = videoTrack.preferredTransform
        var finalTransform = preferredTransform
        var renderSize = naturalSize

        if let cropX, let cropY, let cropWidth, let cropHeight {
            isReEncoded = true

            let requestedRotation = rotateDegrees ?? 0
            let normalizedRotation = ((requestedRotation % 360) + 360) % 360

            let naturalBounds = CGRect(origin: .zero, size: naturalSize)
            let preferredBounds = naturalBounds.applying(preferredTransform)
            let orientationAdjustment = CGAffineTransform(
                translationX: -preferredBounds.minX,
                y: -preferredBounds.minY
            )

            let orientationTransform = preferredTransform.concatenating(orientationAdjustment)

            guard orientationTransform.isNearlyInvertible else {
                result(flutterError("PROCESS_ERROR", message: "Invalid orientation transform during crop"))
                return
            }
            let orientationInverse = orientationTransform.inverted()

            let cropRectDisplay = CGRect(
                x: CGFloat(cropX),
                y: CGFloat(cropY),
                width: CGFloat(cropWidth),
                height: CGFloat(cropHeight)
            )
            let displayBounds = CGRect(
                origin: .zero,
                size: CGSize(
                    width: abs(preferredBounds.width),
                    height: abs(preferredBounds.height)
                )
            )
            let cropTolerance: CGFloat = 0.5
            guard cropRectDisplay.minX >= displayBounds.minX - cropTolerance,
                  cropRectDisplay.minY >= displayBounds.minY - cropTolerance,
                  cropRectDisplay.maxX <= displayBounds.maxX + cropTolerance,
                  cropRectDisplay.maxY <= displayBounds.maxY + cropTolerance else {
                result(flutterError("PROCESS_ERROR", message: "Crop rectangle exceeds the displayed video"))
                return
            }

            let displayCorners = [
                cropRectDisplay.origin,
                CGPoint(x: cropRectDisplay.maxX, y: cropRectDisplay.minY),
                CGPoint(x: cropRectDisplay.minX, y: cropRectDisplay.maxY),
                CGPoint(x: cropRectDisplay.maxX, y: cropRectDisplay.maxY)
            ]

            let fileCorners = displayCorners.map { $0.applying(orientationInverse) }

            let fileMinX = fileCorners.map { $0.x }.min() ?? 0
            let fileMinY = fileCorners.map { $0.y }.min() ?? 0
            let fileMaxX = fileCorners.map { $0.x }.max() ?? 0
            let fileMaxY = fileCorners.map { $0.y }.max() ?? 0

            let fileCropRect = CGRect(
                x: fileMinX,
                y: fileMinY,
                width: fileMaxX - fileMinX,
                height: fileMaxY - fileMinY
            )

            let cropTranslation = CGAffineTransform(
                translationX: -fileCropRect.origin.x,
                y: -fileCropRect.origin.y
            )

            var transform = cropTranslation.concatenating(orientationTransform)

            if normalizedRotation != 0 {
                let clockwiseRadians = CGFloat(normalizedRotation) * .pi / 180
                let rotationTransform = CGAffineTransform(rotationAngle: clockwiseRadians)
                transform = transform.concatenating(rotationTransform)
            }

            let transformedCorners = fileCorners.map { $0.applying(transform) }

            let minX = transformedCorners.map { $0.x }.min() ?? 0
            let minY = transformedCorners.map { $0.y }.min() ?? 0
            let maxX = transformedCorners.map { $0.x }.max() ?? 0
            let maxY = transformedCorners.map { $0.y }.max() ?? 0

            let correctionTransform = CGAffineTransform(
                translationX: -minX,
                y: -minY
            )
            transform = transform.concatenating(correctionTransform)

            let outputWidth = max((maxX - minX).rounded(), CGFloat(1))
            let outputHeight = max((maxY - minY).rounded(), CGFloat(1))
            renderSize = CGSize(width: outputWidth, height: outputHeight)

            finalTransform = transform

        } else if let rotateDegrees, rotateDegrees != 0 {
            isReEncoded = true

            // Apply orientation adjustment to handle existing metadata rotation properly
            let naturalBounds = CGRect(origin: .zero, size: naturalSize)
            let preferredBounds = naturalBounds.applying(preferredTransform)
            let orientationAdjustment = CGAffineTransform(
                translationX: -preferredBounds.minX,
                y: -preferredBounds.minY
            )
            let orientationTransform = preferredTransform.concatenating(orientationAdjustment)

            // Calculate oriented size for render calculations
            let orientedSize = CGSize(width: abs(preferredBounds.width), height: abs(preferredBounds.height))

            var transform = orientationTransform

            let clockwiseRadians = CGFloat(rotateDegrees) * .pi / 180

            // Rotate around the center of the input video
            let centerX = orientedSize.width / 2
            let centerY = orientedSize.height / 2

            transform = transform.translatedBy(x: centerX, y: centerY)
            transform = transform.rotated(by: clockwiseRadians)
            transform = transform.translatedBy(x: -centerX, y: -centerY)

            // Calculate renderSize from actual transformed bounds (more accurate for metadata-rotated videos)
            // Use naturalSize here because transform expects input in natural/file coordinate space
            let testRect = CGRect(origin: .zero, size: naturalSize)
            let transformedBounds = testRect.applying(transform)

            // Get the actual dimensions after the full transform chain
            let finalWidth = abs(transformedBounds.width)
            let finalHeight = abs(transformedBounds.height)
            renderSize = CGSize(width: finalWidth, height: finalHeight)

            // Center the video in the renderSize
            let targetMinX: CGFloat = (renderSize.width - transformedBounds.width) / 2
            let additionalTranslateX = targetMinX - transformedBounds.minX

            let targetMinY: CGFloat = (renderSize.height - transformedBounds.height) / 2
            let additionalTranslateY = targetMinY - transformedBounds.minY

            transform = transform.concatenating(CGAffineTransform(translationX: additionalTranslateX, y: additionalTranslateY))

            finalTransform = transform
        }

        if isReEncoded {
            videoComposition = AVMutableVideoComposition()
            videoComposition!.frameDuration = frameDuration(for: videoTrack)
            videoComposition!.renderSize = renderSize

            let instruction = AVMutableVideoCompositionInstruction()
            instruction.timeRange = CMTimeRange(start: .zero, duration: composition.duration)

            let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)
            layerInstruction.setTransform(finalTransform, at: .zero)

            instruction.layerInstructions = [layerInstruction]
            videoComposition!.instructions = [instruction]
        } else {
            compositionVideoTrack.preferredTransform = preferredTransform
        }

        // Export
        let presetName = isReEncoded ? AVAssetExportPresetHighestQuality : AVAssetExportPresetPassthrough
        guard let exportSession = AVAssetExportSession(asset: composition, presetName: presetName) else {
            result(flutterError("EXPORT_ERROR", message: "Failed to create export session"))
            return
        }

        currentExportSession = exportSession

        if let videoComp = videoComposition {
            exportSession.videoComposition = videoComp
        }

        exportSession.outputURL = outputURL
        exportSession.outputFileType = .mp4
        exportSession.shouldOptimizeForNetworkUse = true
        try? FileManager.default.removeItem(at: outputURL)

        if !isReEncoded {
            exportSession.timeRange =  CMTimeRange(start: .zero, duration: composition.duration)
        }

        startProgressReporting()
        exportSession.exportAsynchronously {
            DispatchQueue.main.async {
                self.stopProgressReporting()
                if self.isDetached {
                    try? FileManager.default.removeItem(at: outputURL)
                } else {
                    switch exportSession.status {
                    case .completed:
                        let outputSize = (try? outputURL.resourceValues(
                            forKeys: [.fileSizeKey]
                        ).fileSize) ?? 0
                        if outputSize > 0 {
                            result([
                                "outputPath": outputPath,
                                "isReEncoded": isReEncoded
                            ])
                        } else {
                            try? FileManager.default.removeItem(at: outputURL)
                            result(self.flutterError("PROCESS_ERROR", message: "Export produced no output"))
                        }
                    case .failed:
                        try? FileManager.default.removeItem(at: outputURL)
                        result(self.flutterError("PROCESS_ERROR", message: "Failed to process video", error: exportSession.error))
                    case .cancelled:
                        try? FileManager.default.removeItem(at: outputURL)
                        result(self.flutterError("PROCESS_CANCELLED", message: "Export cancelled"))
                    default:
                        try? FileManager.default.removeItem(at: outputURL)
                        result(self.flutterError("UNKNOWN", message: "Unknown export status", error: exportSession.error))
                    }
                }
                self.currentExportSession = nil
                if !self.isDetached {
                    self.exportCancellationResult?(nil)
                }
                self.exportCancellationResult = nil
            }
        }
    }

    private func intersection(
        _ requestedRange: CMTimeRange,
        with availableRange: CMTimeRange
    ) -> CMTimeRange? {
        let intersection = CMTimeRangeGetIntersection(
            requestedRange,
            otherRange: availableRange
        )
        guard intersection.isValid,
              !intersection.isEmpty,
              intersection.duration.isNumeric,
              CMTimeCompare(intersection.duration, .zero) > 0 else {
            return nil
        }
        return intersection
    }

    private func frameDuration(for track: AVAssetTrack) -> CMTime {
        let nominal = track.nominalFrameRate
        if nominal.isFinite && nominal > 0 {
            return CMTime(value: 1, timescale: Int32(round(nominal)))
        }
        if track.minFrameDuration.isValid && track.minFrameDuration.value != 0 {
            return track.minFrameDuration
        }
        return CMTime(value: 1, timescale: 30)
    }

    private func flutterError(_ code: String, message: String, error: Error? = nil, details: Any? = nil) -> FlutterError {
        let resolvedMessage = error?.localizedDescription ?? message
        let resolvedDetails: Any?
        if let details = details {
            resolvedDetails = details
        } else if let error = error {
            resolvedDetails = String(describing: error)
        } else {
            resolvedDetails = nil
        }
        return FlutterError(code: code, message: resolvedMessage, details: resolvedDetails)
    }

    private func getVideoInfo(videoPath: String, result: @escaping FlutterResult) {
        let asset = AVURLAsset(url: URL(fileURLWithPath: videoPath))
        loadVideoInfo(asset: asset) { [weak self] loadedInfo in
            guard let self = self else { return }
            DispatchQueue.main.async {
                guard !self.isDetached else { return }
                switch loadedInfo {
                case .success(let info):
                    result(info)
                case .failure(let error):
                    result(self.flutterError(
                        "INFO_ERROR",
                        message: "Failed to load video metadata",
                        error: error
                    ))
                }
            }
        }
    }

    private func loadVideoInfo(
        asset: AVAsset,
        completion: @escaping (Result<[String: Any], Error>) -> Void
    ) {
        asset.loadValuesAsynchronously(forKeys: ["duration", "tracks"]) { [weak self] in
            guard let self = self else { return }
            var error: NSError?
            guard asset.statusOfValue(forKey: "duration", error: &error) == .loaded,
                  asset.statusOfValue(forKey: "tracks", error: &error) == .loaded else {
                completion(.failure(error ?? NSError(
                    domain: "NativeVideoEditor",
                    code: 1,
                    userInfo: [NSLocalizedDescriptionKey: "Video metadata is unavailable"]
                )))
                return
            }
            guard let videoTrack = asset.tracks.first(where: { $0.mediaType == .video }) else {
                completion(.failure(NSError(
                    domain: "NativeVideoEditor",
                    code: 2,
                    userInfo: [NSLocalizedDescriptionKey: "Video track is unavailable"]
                )))
                return
            }

            let trackKeys = [
                "naturalSize",
                "preferredTransform",
                "nominalFrameRate",
                "estimatedDataRate",
            ]
            videoTrack.loadValuesAsynchronously(forKeys: trackKeys) {
                for key in ["naturalSize", "preferredTransform"] {
                    var trackError: NSError?
                    guard videoTrack.statusOfValue(forKey: key, error: &trackError) == .loaded else {
                        completion(.failure(trackError ?? NSError(
                            domain: "NativeVideoEditor",
                            code: 3,
                            userInfo: [NSLocalizedDescriptionKey: "Video track metadata is unavailable: \(key)"]
                        )))
                        return
                    }
                }
                completion(.success(self.loadedVideoInfo(asset: asset)))
            }
        }
    }

    private func loadedVideoInfo(asset: AVAsset) -> [String: Any] {
        let durationSeconds = CMTimeGetSeconds(asset.duration)
        var info: [String: Any] = [
            "duration": durationSeconds.isFinite
                ? Int64(max(0, durationSeconds * 1000))
                : Int64(0),
            "width": 0,
            "height": 0,
            "displayWidth": 0,
            "displayHeight": 0,
            "rotation": 0,
        ]

        if let videoTrack = asset.tracks.first(where: { $0.mediaType == .video }) {
            let naturalSize = videoTrack.naturalSize
            let transform = videoTrack.preferredTransform
            let transformedBounds = CGRect(origin: .zero, size: naturalSize).applying(transform)
            let angle = atan2(transform.b, transform.a) * 180 / .pi
            let roundedAngle = Int(angle.rounded())
            let rotation = ((roundedAngle % 360) + 360) % 360

            info["width"] = Int(abs(naturalSize.width).rounded())
            info["height"] = Int(abs(naturalSize.height).rounded())
            info["displayWidth"] = Int(abs(transformedBounds.width).rounded())
            info["displayHeight"] = Int(abs(transformedBounds.height).rounded())
            info["rotation"] = rotation
            if videoTrack.nominalFrameRate > 0 {
                info["frameRate"] = Double(videoTrack.nominalFrameRate)
            }
            if videoTrack.estimatedDataRate > 0 {
                info["bitrate"] = Int64(videoTrack.estimatedDataRate)
            }
        }
        return info
    }

    private func startProgressReporting() {
        progressTimer?.invalidate()
        progressTimer = Timer.scheduledTimer(withTimeInterval: 0.1, repeats: true) { [weak self] _ in
            guard let self = self,
                  let session = self.currentExportSession,
                  let sink = self.progressEventSink else { return }

            let progress = Double(session.progress)
            sink(progress)
        }
    }

    private func stopProgressReporting() {
        progressTimer?.invalidate()
        progressTimer = nil
    }

    public func detachFromEngine(for registrar: FlutterPluginRegistrar) {
        guard !isDetached else { return }
        isDetached = true
        progressEventSink = nil
        stopProgressReporting()

        currentExportSession?.cancelExport()
        exportCancellationResult = nil

        cancelledFrameRequests.formUnion(frameGenerators.keys)
        for outputPaths in frameOutputPaths.values {
            removeFiles(at: outputPaths)
        }
        frameCancellationResults.removeAll()
        for generator in frameGenerators.values {
            generator.cancelAllCGImageGeneration()
        }
    }
}

private extension CGAffineTransform {
    var isNearlyInvertible: Bool {
        let determinant = (a * d) - (b * c)
        return abs(determinant) > 1e-8
    }
}

extension NativeVideoEditorPlugin: FlutterStreamHandler {
    public func onListen(withArguments arguments: Any?, eventSink events: @escaping FlutterEventSink) -> FlutterError? {
        if !isDetached {
            progressEventSink = events
        }
        return nil
    }

    public func onCancel(withArguments arguments: Any?) -> FlutterError? {
        progressEventSink = nil
        stopProgressReporting()
        return nil
    }
}
