import 'dart:async';
import 'dart:typed_data';
import 'dart:ui' as ui;

import 'package:exif_reader/exif_reader.dart' as exif;
import 'package:flutter/widgets.dart';
import 'package:image/image.dart' as img;
// ignore: implementation_imports
import 'package:image/src/util/rational.dart' as img_util;
import "package:photos/models/file/file.dart";
import "package:photos/utils/exif_util.dart";

Future<ImageInfo> getImageInfo(ImageProvider imageProvider) {
  final completer = Completer<ImageInfo>();
  final imageStream = imageProvider.resolve(const ImageConfiguration());
  final listener = ImageStreamListener(((imageInfo, _) {
    completer.complete(imageInfo);
  }));
  imageStream.addListener(listener);
  completer.future.whenComplete(() => imageStream.removeListener(listener));
  return completer.future;
}

Future<ui.Image> convertImageToFlutterUi(img.Image image) async {
  if (image.format != img.Format.uint8 || image.numChannels != 4) {
    final cmd = img.Command()
      ..image(image)
      ..convert(format: img.Format.uint8, numChannels: 4);
    final rgba8 = await cmd.getImageThread();
    if (rgba8 != null) {
      image = rgba8;
    }
  }

  final ui.ImmutableBuffer buffer = await ui.ImmutableBuffer.fromUint8List(
    image.toUint8List(),
  );

  final ui.ImageDescriptor id = ui.ImageDescriptor.raw(
    buffer,
    height: image.height,
    width: image.width,
    pixelFormat: ui.PixelFormat.rgba8888,
  );

  final ui.Codec codec = await id.instantiateCodec(
    targetHeight: image.height,
    targetWidth: image.width,
  );

  final ui.FrameInfo fi = await codec.getNextFrame();
  final ui.Image uiImage = fi.image;

  return uiImage;
}

const _copiedExifFields = [
  (ifd: "Image", source: "Make", dest: "Make", affectsRendering: false),
  (ifd: "Image", source: "Model", dest: "Model", affectsRendering: false),
  (
    ifd: "Image",
    source: "Orientation",
    dest: "Orientation",
    affectsRendering: true,
  ),
  (ifd: "Image", source: "Artist", dest: "Artist", affectsRendering: false),
  (
    ifd: "Image",
    source: "Copyright",
    dest: "Copyright",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "DateTimeOriginal",
    dest: "DateTimeOriginal",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "DateTimeDigitized",
    dest: "DateTimeDigitized",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "OffsetTimeOriginal",
    dest: "OffsetTimeOriginal",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "LensModel",
    dest: "LensModel",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "ExposureTime",
    dest: "ExposureTime",
    affectsRendering: false,
  ),
  (ifd: "EXIF", source: "FNumber", dest: "FNumber", affectsRendering: false),
  (
    ifd: "EXIF",
    source: "ISOSpeedRatings",
    dest: "ISOSpeed",
    affectsRendering: false,
  ), //ishowspeed
  (
    ifd: "EXIF",
    source: "FocalLength",
    dest: "FocalLength",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "FocalLengthIn35mmFilm",
    dest: "FocalLengthIn35mmFilm",
    affectsRendering: false,
  ),
  (
    ifd: "EXIF",
    source: "ColorSpace",
    dest: "ColorSpace",
    affectsRendering: false,
  ),
];

img.IfdValue? convertExifReaderValueToImageValue(exif.IfdTag? tag) {
  final values = tag?.values;
  if (tag == null || values == null || values is exif.IfdNone) {
    return null;
  }

  List<int> ints() => values.toList().cast<int>();
  List<double> doubles() =>
      values.toList().map((value) => (value as num).toDouble()).toList();
  List<img_util.Rational> ratios() {
    return values
        .toList()
        .cast<exif.Ratio>()
        .map((value) => img_util.Rational(value.numerator, value.denominator))
        .toList();
  }

  return switch (tag.tagType) {
    "Byte" => img.IfdByteValue.list(Uint8List.fromList(ints())),
    "ASCII" => img.IfdValueAscii(
      String.fromCharCodes(ints().takeWhile((byte) => byte != 0)),
    ),
    "Short" => img.IfdValueShort.list(ints()),
    "Long" || "IFD" => img.IfdValueLong.list(ints()),
    "Signed Byte" => img.IfdValueSByte.list(ints()),
    "Undefined" => img.IfdValueUndefined.list(ints()),
    "Signed Short" => img.IfdValueSShort.list(ints()),
    "Signed Long" => img.IfdValueSLong.list(ints()),
    "Ratio" => img.IfdValueRational.list(ratios()),
    "Signed Ratio" => img.IfdValueSRational.list(ratios()),
    "Single-Precision Floating Point (32-bit)" => img.IfdValueSingle.list(
      doubles(),
    ),
    "Double-Precision Floating Point (64-bit)" => img.IfdValueDouble.list(
      doubles(),
    ),
    _ => null,
  };
}

// TODO: Move EXIF writes off the Dart image library to a Rust implementation.
Future<void> copyEXIF(
  EnteFile src,
  img.Image dest, {
  bool copyRenderingFields = true,
}) async {
  final srcExif = await getExif(src);
  for (final field in _copiedExifFields) {
    if (!copyRenderingFields && field.affectsRendering) {
      continue;
    }
    final destIfd = field.ifd == "Image"
        ? dest.exif.imageIfd
        : dest.exif.exifIfd;
    final value = convertExifReaderValueToImageValue(
      srcExif["${field.ifd} ${field.source}"],
    );
    if (value != null) {
      destIfd[field.dest] = value;
    }
  }
}
