// Camera RAW suffixes recognized by the libvips 8.18.7 dcraw loader bundled on
// Windows and Linux. macOS conversion uses sips and depends on OS/camera support.
// https://github.com/libvips/libvips/blob/v8.18.7/libvips/foreign/dcrawload.c
export const cameraRawExtensions = [
    "3fr",
    "ari",
    "arw",
    "cap",
    "cin",
    "cr2",
    "cr3",
    "crw",
    "dcr",
    "dng",
    "erf",
    "fff",
    "iiq",
    "k25",
    "kdc",
    "mdc",
    "mos",
    "mrw",
    "nef",
    "nrw",
    "orf",
    "ori",
    "pef",
    "pxn",
    "raf",
    "raw",
    "rw2",
    "rwl",
    "sr2",
    "srf",
    "srw",
    "x3f",
];

// Formats that need a native conversion attempt before the browser can render
// them. The platform decoder may not support every camera or RAW variant.
const needsJPEGConversionExtensions = [
    ...cameraRawExtensions,
    "heic",
    "jp2",
    "psd",
    "tif",
    "tiff",
];

export const needsJPEGConversion = (extension: string) =>
    needsJPEGConversionExtensions.includes(extension.toLowerCase());

export const isHEICExtension = (extension: string) => {
    const ext = extension.toLowerCase();
    return ext == "heic" || ext == "heif";
};
