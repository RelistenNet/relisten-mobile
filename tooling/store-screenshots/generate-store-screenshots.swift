#!/usr/bin/env swift

import AppKit
import CoreGraphics
import CoreText
import Foundation
import ImageIO

struct Config: Decodable {
  var inputDir: String
  var outputDir: String
  var fontPath: String?
  var fontNames: [String]
  var gradientTop: String
  var gradientBottom: String
  var platforms: [PlatformConfig]
  var screens: [ScreenConfig]
}

struct PlatformConfig: Decodable {
  var name: String
  var inputSubdir: String
  var outputSubdir: String
  var canvasWidth: Int
  var canvasHeight: Int
  var deviceFrame: String
  var frameImagePath: String?
  var frameScreenRect: FrameScreenRect?
  var frameScreenCornerRatio: CGFloat?
  var deviceWidthRatio: CGFloat
  var deviceBorderRatio: CGFloat?
  var deviceBottomMarginRatio: CGFloat
  var textVerticalOffsetRatio: CGFloat?
  var textHeightRatio: CGFloat
  var headlineFontScale: CGFloat?
}

struct FrameScreenRect: Decodable {
  var x: CGFloat
  var y: CGFloat
  var width: CGFloat
  var height: CGFloat
}

struct ScreenConfig: Decodable {
  var id: String
  var input: String
  var title: [String]
}

struct Arguments {
  var configPath = "tooling/store-screenshots/config.json"
  var inputDir: String?
  var outputDir: String?
  var platform: String?
}

enum GeneratorError: Error, CustomStringConvertible {
  case message(String)

  var description: String {
    switch self {
    case let .message(value):
      return value
    }
  }
}

func parseArguments() -> Arguments {
  var args = Arguments()
  var iterator = CommandLine.arguments.dropFirst().makeIterator()

  while let arg = iterator.next() {
    switch arg {
    case "--config":
      args.configPath = iterator.next() ?? args.configPath
    case "--input":
      args.inputDir = iterator.next()
    case "--output":
      args.outputDir = iterator.next()
    case "--platform":
      args.platform = iterator.next()
    case "--help", "-h":
      print("""
      Usage:
        yarn store:screenshots
        yarn store:screenshots -- --platform ios
        yarn store:screenshots -- --platform ipados
        yarn store:screenshots -- --input ~/Downloads/relisten-store-shots --output dist/store-screenshots
      """)
      exit(0)
    default:
      print("Ignoring unknown argument: \(arg)")
    }
  }

  return args
}

func expandPath(_ value: String, relativeTo base: URL = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)) -> URL {
  let expanded: String
  if value == "~" {
    expanded = FileManager.default.homeDirectoryForCurrentUser.path
  } else if value.hasPrefix("~/") {
    expanded = FileManager.default.homeDirectoryForCurrentUser
      .appendingPathComponent(String(value.dropFirst(2)))
      .path
  } else {
    expanded = value
  }

  if expanded.hasPrefix("/") {
    return URL(fileURLWithPath: expanded).standardizedFileURL
  }

  return base.appendingPathComponent(expanded).standardizedFileURL
}

func loadConfig(path: String) throws -> Config {
  let url = expandPath(path)
  let data = try Data(contentsOf: url)
  return try JSONDecoder().decode(Config.self, from: data)
}

func color(fromHex hex: String) throws -> NSColor {
  var value = hex.trimmingCharacters(in: .whitespacesAndNewlines)
  if value.hasPrefix("#") {
    value.removeFirst()
  }

  guard value.count == 6, let intValue = Int(value, radix: 16) else {
    throw GeneratorError.message("Invalid color: \(hex)")
  }

  return NSColor(
    calibratedRed: CGFloat((intValue >> 16) & 0xff) / 255,
    green: CGFloat((intValue >> 8) & 0xff) / 255,
    blue: CGFloat(intValue & 0xff) / 255,
    alpha: 1
  )
}

func registerFont(path: String?) {
  guard let path else {
    return
  }

  let url = expandPath(path)
  guard FileManager.default.fileExists(atPath: url.path) else {
    return
  }

  CTFontManagerRegisterFontsForURL(url as CFURL, .process, nil)
}

func preferredFont(names: [String], size: CGFloat) -> NSFont {
  for name in names {
    if let font = NSFont(name: name, size: size) {
      return font
    }
  }

  return NSFont.systemFont(ofSize: size, weight: .black)
}

func loadImage(_ url: URL) throws -> NSImage {
  guard
    let source = CGImageSourceCreateWithURL(url as CFURL, nil),
    let cgImage = CGImageSourceCreateImageAtIndex(source, 0, nil)
  else {
    throw GeneratorError.message("Could not load image: \(url.path)")
  }

  return NSImage(
    cgImage: cgImage,
    size: NSSize(width: cgImage.width, height: cgImage.height)
  )
}

func findInputImage(inputDir: URL, stem: String) -> URL? {
  let extensions = ["png", "PNG", "jpg", "JPG", "jpeg", "JPEG"]

  if stem.contains(".") {
    let direct = inputDir.appendingPathComponent(stem)
    if FileManager.default.fileExists(atPath: direct.path) {
      return direct
    }
  }

  for ext in extensions {
    let candidate = inputDir.appendingPathComponent("\(stem).\(ext)")
    if FileManager.default.fileExists(atPath: candidate.path) {
      return candidate
    }
  }

  return nil
}

func roundedPath(_ rect: NSRect, radius: CGFloat) -> NSBezierPath {
  NSBezierPath(roundedRect: rect, xRadius: radius, yRadius: radius)
}

func drawGradient(in rect: NSRect, top: NSColor, bottom: NSColor) {
  guard let gradient = NSGradient(starting: bottom, ending: top) else {
    bottom.setFill()
    rect.fill()
    return
  }

  gradient.draw(in: rect, angle: 90)
}

func textAttributes(font: NSFont, lineSpacing: CGFloat) -> [NSAttributedString.Key: Any] {
  let paragraph = NSMutableParagraphStyle()
  paragraph.alignment = .center
  paragraph.lineSpacing = lineSpacing
  paragraph.lineBreakMode = .byWordWrapping

  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.22)
  shadow.shadowBlurRadius = 14
  shadow.shadowOffset = NSSize(width: 0, height: -4)

  return [
    .font: font,
    .foregroundColor: NSColor.white,
    .paragraphStyle: paragraph,
    .kern: 0,
    .shadow: shadow
  ]
}

func measuredText(_ string: String, attributes: [NSAttributedString.Key: Any], width: CGFloat) -> NSSize {
  let rect = NSString(string: string).boundingRect(
    with: NSSize(width: width, height: .greatestFiniteMagnitude),
    options: [.usesLineFragmentOrigin, .usesFontLeading],
    attributes: attributes
  )

  return rect.size
}

func drawTitle(lines: [String], in rect: NSRect, fontNames: [String], canvasWidth: CGFloat, fontScale: CGFloat) {
  let text = lines.joined(separator: "\n")
  let maxWidth = rect.width
  let maxHeight = rect.height
  var fontSize = canvasWidth * fontScale
  var attributes = textAttributes(font: preferredFont(names: fontNames, size: fontSize), lineSpacing: fontSize * 0.01)
  var size = measuredText(text, attributes: attributes, width: maxWidth)

  while (size.width > maxWidth || size.height > maxHeight) && fontSize > 42 {
    fontSize -= 4
    attributes = textAttributes(font: preferredFont(names: fontNames, size: fontSize), lineSpacing: fontSize * 0.01)
    size = measuredText(text, attributes: attributes, width: maxWidth)
  }

  // Stay Retro has uneven vertical metrics; this centers the visible glyphs, not just the text box.
  let opticalCenterOffset = fontSize * 0.18
  let drawRect = NSRect(
    x: rect.minX,
    y: rect.minY + (rect.height - size.height) / 2 - opticalCenterOffset,
    width: rect.width,
    height: size.height + fontSize * 0.22
  )

  NSString(string: text).draw(with: drawRect, options: [.usesLineFragmentOrigin, .usesFontLeading], attributes: attributes)
}

func drawSideButton(x: CGFloat, y: CGFloat, width: CGFloat, height: CGFloat, radius: CGFloat, color: NSColor) {
  color.setFill()
  roundedPath(NSRect(x: x, y: y, width: width, height: height), radius: radius).fill()
}

func drawDeviceShadow(_ outerRect: NSRect, canvas: NSSize, radius: CGFloat) {
  NSGraphicsContext.saveGraphicsState()
  let shadow = NSShadow()
  shadow.shadowColor = NSColor.black.withAlphaComponent(0.36)
  shadow.shadowBlurRadius = canvas.width * 0.055
  shadow.shadowOffset = NSSize(width: 0, height: -canvas.height * 0.02)
  shadow.set()
  NSColor.black.setFill()
  roundedPath(outerRect, radius: radius).fill()
  NSGraphicsContext.restoreGraphicsState()
}

func drawScreenImage(_ image: NSImage, in screenRect: NSRect, radius: CGFloat) {
  NSGraphicsContext.saveGraphicsState()
  roundedPath(screenRect, radius: radius).addClip()
  image.draw(
    in: screenRect,
    from: NSRect(origin: .zero, size: image.size),
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
  )
  NSGraphicsContext.restoreGraphicsState()
}

func drawIPhoneFrame(image: NSImage, canvas: NSSize, screenRect: NSRect, outerRect: NSRect) {
  let outerRadius = outerRect.width * 0.095
  let screenRadius = screenRect.width * 0.079
  let metal = NSColor(calibratedWhite: 0.12, alpha: 1)
  let metalDark = NSColor(calibratedWhite: 0.035, alpha: 1)
  let metalHighlight = NSColor(calibratedWhite: 0.26, alpha: 1)
  let buttonColor = NSColor(calibratedWhite: 0.20, alpha: 1)

  drawSideButton(
    x: outerRect.minX - outerRect.width * 0.018,
    y: outerRect.minY + outerRect.height * 0.755,
    width: outerRect.width * 0.018,
    height: outerRect.height * 0.052,
    radius: outerRect.width * 0.008,
    color: buttonColor
  )
  drawSideButton(
    x: outerRect.minX - outerRect.width * 0.018,
    y: outerRect.minY + outerRect.height * 0.655,
    width: outerRect.width * 0.018,
    height: outerRect.height * 0.075,
    radius: outerRect.width * 0.008,
    color: buttonColor
  )
  drawSideButton(
    x: outerRect.minX - outerRect.width * 0.018,
    y: outerRect.minY + outerRect.height * 0.55,
    width: outerRect.width * 0.018,
    height: outerRect.height * 0.075,
    radius: outerRect.width * 0.008,
    color: buttonColor
  )
  drawSideButton(
    x: outerRect.maxX,
    y: outerRect.minY + outerRect.height * 0.64,
    width: outerRect.width * 0.016,
    height: outerRect.height * 0.12,
    radius: outerRect.width * 0.008,
    color: buttonColor
  )

  drawDeviceShadow(outerRect, canvas: canvas, radius: outerRadius)

  metal.setFill()
  roundedPath(outerRect, radius: outerRadius).fill()

  if let rim = NSGradient(colors: [
    NSColor.white.withAlphaComponent(0.16),
    metalHighlight,
    metal,
    metalDark
  ]) {
    rim.draw(in: roundedPath(outerRect.insetBy(dx: 3, dy: 3), radius: outerRadius * 0.94), angle: 90)
  }

  NSColor.black.setFill()
  roundedPath(outerRect.insetBy(dx: outerRect.width * 0.025, dy: outerRect.width * 0.025), radius: outerRadius * 0.82).fill()

  drawScreenImage(image, in: screenRect, radius: screenRadius)

  let islandWidth = screenRect.width * 0.30
  let islandHeight = screenRect.width * 0.085
  let islandRect = NSRect(
    x: screenRect.midX - islandWidth / 2,
    y: screenRect.maxY - islandHeight - screenRect.width * 0.045,
    width: islandWidth,
    height: islandHeight
  )
  NSColor.black.setFill()
  roundedPath(islandRect, radius: islandHeight / 2).fill()

  NSColor.white.withAlphaComponent(0.22).setStroke()
  let highlight = roundedPath(screenRect.insetBy(dx: 1.5, dy: 1.5), radius: screenRadius)
  highlight.lineWidth = 2
  highlight.stroke()
}

func drawPixelFrame(image: NSImage, canvas: NSSize, screenRect: NSRect, outerRect: NSRect) {
  let outerRadius = outerRect.width * 0.075
  let screenRadius = screenRect.width * 0.052
  let body = NSColor(calibratedRed: 0.09, green: 0.10, blue: 0.11, alpha: 1)
  let bodyLight = NSColor(calibratedRed: 0.22, green: 0.24, blue: 0.25, alpha: 1)

  drawSideButton(
    x: outerRect.maxX,
    y: outerRect.minY + outerRect.height * 0.64,
    width: outerRect.width * 0.015,
    height: outerRect.height * 0.14,
    radius: outerRect.width * 0.006,
    color: bodyLight
  )
  drawSideButton(
    x: outerRect.maxX,
    y: outerRect.minY + outerRect.height * 0.48,
    width: outerRect.width * 0.014,
    height: outerRect.height * 0.10,
    radius: outerRect.width * 0.006,
    color: bodyLight
  )

  drawDeviceShadow(outerRect, canvas: canvas, radius: outerRadius)

  body.setFill()
  roundedPath(outerRect, radius: outerRadius).fill()
  bodyLight.withAlphaComponent(0.42).setStroke()
  let rim = roundedPath(outerRect.insetBy(dx: 3, dy: 3), radius: outerRadius * 0.92)
  rim.lineWidth = 3
  rim.stroke()

  NSColor.black.setFill()
  roundedPath(outerRect.insetBy(dx: outerRect.width * 0.022, dy: outerRect.width * 0.022), radius: outerRadius * 0.78).fill()

  drawScreenImage(image, in: screenRect, radius: screenRadius)

  let cameraDiameter = screenRect.width * 0.048
  let cameraRect = NSRect(
    x: screenRect.midX - cameraDiameter / 2,
    y: screenRect.maxY - cameraDiameter - screenRect.width * 0.035,
    width: cameraDiameter,
    height: cameraDiameter
  )
  NSColor.black.setFill()
  NSBezierPath(ovalIn: cameraRect).fill()
  NSColor.white.withAlphaComponent(0.12).setFill()
  NSBezierPath(ovalIn: cameraRect.insetBy(dx: cameraDiameter * 0.33, dy: cameraDiameter * 0.33)).fill()

  NSColor.white.withAlphaComponent(0.16).setStroke()
  let highlight = roundedPath(screenRect.insetBy(dx: 1.5, dy: 1.5), radius: screenRadius)
  highlight.lineWidth = 2
  highlight.stroke()
}

func drawIPadFrame(image: NSImage, canvas: NSSize, screenRect: NSRect, outerRect: NSRect) {
  let outerRadius = outerRect.width * 0.055
  let screenRadius = screenRect.width * 0.030
  let body = NSColor(calibratedWhite: 0.005, alpha: 1)
  let edge = NSColor(calibratedWhite: 0.24, alpha: 1)
  let edgeDark = NSColor(calibratedWhite: 0.09, alpha: 1)

  drawSideButton(
    x: outerRect.maxX,
    y: outerRect.minY + outerRect.height * 0.805,
    width: outerRect.width * 0.0045,
    height: outerRect.height * 0.038,
    radius: outerRect.width * 0.0025,
    color: edgeDark
  )
  drawSideButton(
    x: outerRect.maxX,
    y: outerRect.minY + outerRect.height * 0.745,
    width: outerRect.width * 0.0045,
    height: outerRect.height * 0.038,
    radius: outerRect.width * 0.0025,
    color: edgeDark
  )
  let topButtonHeight = outerRect.width * 0.004
  drawSideButton(
    x: outerRect.maxX - outerRect.width * 0.080,
    y: outerRect.maxY - topButtonHeight,
    width: outerRect.width * 0.045,
    height: topButtonHeight,
    radius: outerRect.width * 0.0025,
    color: edgeDark
  )

  drawDeviceShadow(outerRect, canvas: canvas, radius: outerRadius)

  body.setFill()
  roundedPath(outerRect, radius: outerRadius).fill()

  edge.withAlphaComponent(0.80).setStroke()
  let outerStroke = roundedPath(outerRect.insetBy(dx: 3, dy: 3), radius: outerRadius * 0.95)
  outerStroke.lineWidth = 4
  outerStroke.stroke()

  NSColor.white.withAlphaComponent(0.10).setStroke()
  let bevel = roundedPath(outerRect.insetBy(dx: outerRect.width * 0.010, dy: outerRect.width * 0.010), radius: outerRadius * 0.78)
  bevel.lineWidth = 2
  bevel.stroke()

  NSColor.black.setFill()
  roundedPath(outerRect.insetBy(dx: outerRect.width * 0.018, dy: outerRect.width * 0.018), radius: outerRadius * 0.72).fill()

  drawScreenImage(image, in: screenRect, radius: screenRadius)

  let cameraDiameter = outerRect.width * 0.010
  let cameraRect = NSRect(
    x: outerRect.midX - cameraDiameter / 2,
    y: outerRect.maxY - ((outerRect.maxY - screenRect.maxY) / 2) - cameraDiameter / 2,
    width: cameraDiameter,
    height: cameraDiameter
  )
  NSColor(calibratedWhite: 0.025, alpha: 1).setFill()
  NSBezierPath(ovalIn: cameraRect).fill()
  NSColor.white.withAlphaComponent(0.10).setStroke()
  let lens = NSBezierPath(ovalIn: cameraRect)
  lens.lineWidth = 1.5
  lens.stroke()

  NSColor.white.withAlphaComponent(0.12).setStroke()
  let highlight = roundedPath(screenRect.insetBy(dx: 2, dy: 2), radius: screenRadius)
  highlight.lineWidth = 2
  highlight.stroke()
}

struct DeviceLayout {
  var screenRect: NSRect
  var outerRect: NSRect
}

struct FrameTemplate {
  var image: NSImage
  var screenRect: NSRect
  var screenCornerRatio: CGFloat
}

func loadFrameTemplate(platform: PlatformConfig) throws -> FrameTemplate? {
  guard let frameImagePath = platform.frameImagePath else {
    return nil
  }
  guard let frameScreenRect = platform.frameScreenRect else {
    throw GeneratorError.message("Missing frameScreenRect for \(platform.name)")
  }

  let frameImage = try loadImage(expandPath(frameImagePath))
  let frameImageHeight = frameImage.size.height
  let screenRect = NSRect(
    x: frameScreenRect.x,
    y: frameImageHeight - frameScreenRect.y - frameScreenRect.height,
    width: frameScreenRect.width,
    height: frameScreenRect.height
  )

  return FrameTemplate(
    image: frameImage,
    screenRect: screenRect,
    screenCornerRatio: platform.frameScreenCornerRatio ?? 0.04
  )
}

func deviceLayout(image: NSImage, canvas: NSSize, platform: PlatformConfig, frameTemplate: FrameTemplate?) -> DeviceLayout {
  let canvasWidth = canvas.width
  let canvasHeight = canvas.height
  var screenWidth = canvasWidth * platform.deviceWidthRatio
  var screenHeight = screenWidth * image.size.height / image.size.width
  var outerWidth: CGFloat
  var outerHeight: CGFloat
  let border = max(18, canvasWidth * (platform.deviceBorderRatio ?? 0.022))
  let maxOuterHeight = canvasHeight * 0.88

  if let frameTemplate {
    var scale = screenWidth / frameTemplate.screenRect.width
    outerWidth = frameTemplate.image.size.width * scale
    outerHeight = frameTemplate.image.size.height * scale

    if outerHeight > maxOuterHeight {
      scale = maxOuterHeight / frameTemplate.image.size.height
      outerWidth = frameTemplate.image.size.width * scale
      outerHeight = frameTemplate.image.size.height * scale
      screenWidth = frameTemplate.screenRect.width * scale
      screenHeight = frameTemplate.screenRect.height * scale
    }

    let outerBottom = canvasHeight * platform.deviceBottomMarginRatio
    let alignedOuterRect = NSRect(
      x: (canvasWidth - outerWidth) / 2,
      y: outerBottom,
      width: outerWidth,
      height: outerHeight
    )
    let alignedScreenRect = NSRect(
      x: alignedOuterRect.minX + frameTemplate.screenRect.minX * scale,
      y: alignedOuterRect.minY + frameTemplate.screenRect.minY * scale,
      width: frameTemplate.screenRect.width * scale,
      height: frameTemplate.screenRect.height * scale
    )

    return DeviceLayout(screenRect: alignedScreenRect, outerRect: alignedOuterRect)
  }

  outerWidth = screenWidth + border * 2
  outerHeight = screenHeight + border * 2

  if outerHeight > maxOuterHeight {
    outerHeight = maxOuterHeight
    screenHeight = outerHeight - border * 2
    screenWidth = screenHeight * image.size.width / image.size.height
    outerWidth = screenWidth + border * 2
  }

  let outerBottom = canvasHeight * platform.deviceBottomMarginRatio
  let alignedOuterRect = NSRect(
    x: (canvasWidth - outerWidth) / 2,
    y: outerBottom,
    width: outerWidth,
    height: outerHeight
  )
  let alignedScreenRect = alignedOuterRect.insetBy(dx: border, dy: border)

  return DeviceLayout(screenRect: alignedScreenRect, outerRect: alignedOuterRect)
}

func titleRect(canvas: NSSize, platform: PlatformConfig, deviceOuterRect: NSRect) -> NSRect {
  let textHorizontalMargin = canvas.width * 0.07
  let gapBottom = min(max(deviceOuterRect.maxY, 0), canvas.height)
  let gapHeight = max(0, canvas.height - gapBottom)
  let preferredHeight = canvas.height * platform.textHeightRatio
  let titleHeight = min(preferredHeight, gapHeight)
  let verticalOffset = canvas.height * (platform.textVerticalOffsetRatio ?? 0)

  return NSRect(
    x: textHorizontalMargin,
    y: gapBottom + (gapHeight - titleHeight) / 2 + verticalOffset,
    width: canvas.width - textHorizontalMargin * 2,
    height: titleHeight
  )
}

func drawTemplateFrame(image: NSImage, canvas: NSSize, layout: DeviceLayout, frameTemplate: FrameTemplate) {
  drawScreenImage(
    image,
    in: layout.screenRect,
    radius: layout.screenRect.width * frameTemplate.screenCornerRatio
  )
  frameTemplate.image.draw(
    in: layout.outerRect,
    from: NSRect(origin: .zero, size: frameTemplate.image.size),
    operation: .sourceOver,
    fraction: 1,
    respectFlipped: false,
    hints: [.interpolation: NSImageInterpolation.high]
  )
}

func drawDevice(image: NSImage, canvas: NSSize, platform: PlatformConfig, layout: DeviceLayout, frameTemplate: FrameTemplate?) {
  if let frameTemplate {
    drawTemplateFrame(image: image, canvas: canvas, layout: layout, frameTemplate: frameTemplate)
    return
  }

  switch platform.deviceFrame {
  case "ipad13":
    drawIPadFrame(image: image, canvas: canvas, screenRect: layout.screenRect, outerRect: layout.outerRect)
  case "pixel7a":
    drawPixelFrame(image: image, canvas: canvas, screenRect: layout.screenRect, outerRect: layout.outerRect)
  default:
    drawIPhoneFrame(image: image, canvas: canvas, screenRect: layout.screenRect, outerRect: layout.outerRect)
  }
}

func render(screen: ScreenConfig, platform: PlatformConfig, inputURL: URL, outputURL: URL, config: Config) throws {
  let canvas = NSSize(width: platform.canvasWidth, height: platform.canvasHeight)
  let screenshot = try loadImage(inputURL)
  let frameTemplate = try loadFrameTemplate(platform: platform)
  let top = try color(fromHex: config.gradientTop)
  let bottom = try color(fromHex: config.gradientBottom)

  guard
    let bitmap = NSBitmapImageRep(
      bitmapDataPlanes: nil,
      pixelsWide: Int(canvas.width),
      pixelsHigh: Int(canvas.height),
      bitsPerSample: 8,
      samplesPerPixel: 4,
      hasAlpha: true,
      isPlanar: false,
      colorSpaceName: .deviceRGB,
      bytesPerRow: 0,
      bitsPerPixel: 0
    ),
    let context = NSGraphicsContext(bitmapImageRep: bitmap)
  else {
    throw GeneratorError.message("Could not create bitmap canvas")
  }

  NSGraphicsContext.saveGraphicsState()
  NSGraphicsContext.current = context
  context.shouldAntialias = true
  defer {
    context.flushGraphics()
    NSGraphicsContext.restoreGraphicsState()
  }

  drawGradient(in: NSRect(origin: .zero, size: canvas), top: top, bottom: bottom)

  let layout = deviceLayout(
    image: screenshot,
    canvas: canvas,
    platform: platform,
    frameTemplate: frameTemplate
  )
  let titleRect = titleRect(canvas: canvas, platform: platform, deviceOuterRect: layout.outerRect)

  drawDevice(
    image: screenshot,
    canvas: canvas,
    platform: platform,
    layout: layout,
    frameTemplate: frameTemplate
  )
  drawTitle(
    lines: screen.title,
    in: titleRect,
    fontNames: config.fontNames,
    canvasWidth: canvas.width,
    fontScale: platform.headlineFontScale ?? 0.15
  )

  guard let data = bitmap.representation(using: .png, properties: [:]) else {
    throw GeneratorError.message("Could not encode PNG")
  }

  try FileManager.default.createDirectory(at: outputURL.deletingLastPathComponent(), withIntermediateDirectories: true)
  try data.write(to: outputURL)
}

func slugSuffix(_ id: String) -> String {
  id.replacingOccurrences(of: " ", with: "-").lowercased()
}

func main() throws {
  let args = parseArguments()
  var config = try loadConfig(path: args.configPath)
  if let inputDir = args.inputDir {
    config.inputDir = inputDir
  }
  if let outputDir = args.outputDir {
    config.outputDir = outputDir
  }

  registerFont(path: config.fontPath)

  let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
  let inputRoot = expandPath(config.inputDir, relativeTo: root)
  let outputRoot = expandPath(config.outputDir, relativeTo: root)
  let platforms = config.platforms.filter { platform in
    args.platform == nil || args.platform == "all" || platform.name == args.platform
  }

  guard !platforms.isEmpty else {
    throw GeneratorError.message("No platforms matched --platform \(args.platform ?? "")")
  }

  for platform in platforms {
    let platformInputRoot = inputRoot.appendingPathComponent(platform.inputSubdir)
    let platformOutputRoot = outputRoot.appendingPathComponent(platform.outputSubdir)

    for screen in config.screens {
      guard let inputURL = findInputImage(inputDir: platformInputRoot, stem: screen.input) else {
        throw GeneratorError.message("Missing input image for \(platform.name) \(screen.input) in \(platformInputRoot.path)")
      }

      let outputURL = platformOutputRoot.appendingPathComponent("\(screen.id).png")
      try render(screen: screen, platform: platform, inputURL: inputURL, outputURL: outputURL, config: config)
      print("Wrote \(outputURL.path)")
    }
  }
}

do {
  try main()
} catch {
  fputs("store screenshot generator failed: \(error)\n", stderr)
  exit(1)
}
