// Image extensions that browsers are unlikely to render, for which the desktop
// app should attempt native JPEG conversion. RAW support depends on the
// platform decoder and camera model.
const needsJPEGConversionExtensions = [
    "arw",
    "cr2",
    "cr3",
    "dng",
    "heic",
    "jp2",
    "nef",
    "nrw",
    "orf",
    "pef",
    "psd",
    "raf",
    "rw2",
    "srw",
    "tif",
    "tiff",
];

export const needsJPEGConversion = (extension: string) =>
    needsJPEGConversionExtensions.includes(extension.toLowerCase());

export const isHEICExtension = (extension: string) => {
    const ext = extension.toLowerCase();
    return ext == "heic" || ext == "heif";
};
