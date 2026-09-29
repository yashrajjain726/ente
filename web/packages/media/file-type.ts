import { cameraRawExtensions } from "./formats";

export const FileType = { image: 0, video: 1, livePhoto: 2 } as const;

export type FileType = (typeof FileType)[keyof typeof FileType];

export interface FileTypeInfo {
    fileType: FileType;
    extension: string;
    mimeType?: string;
}

// Retain the MIME types used by the existing RAW fallbacks. Other RAW formats
// can be accepted and sent to the native decoder using only their extension.
const cameraRawMIMETypes: Partial<Record<string, string>> = {
    crw: "image/x-canon-crw",
    orf: "image/x-olympus-orf",
    raf: "image/x-fuji-raf",
};

// These are formats that automatic file type detection misses for some files
// found in the wild.
export const KnownFileTypeInfos: FileTypeInfo[] = [
    { fileType: FileType.image, extension: "jpeg", mimeType: "image/jpeg" },
    { fileType: FileType.image, extension: "jpg", mimeType: "image/jpeg" },
    { fileType: FileType.video, extension: "webm", mimeType: "video/webm" },
    { fileType: FileType.video, extension: "mod", mimeType: "video/mpeg" },
    { fileType: FileType.video, extension: "mp4", mimeType: "video/mp4" },
    { fileType: FileType.image, extension: "gif", mimeType: "image/gif" },
    { fileType: FileType.video, extension: "dv", mimeType: "video/x-dv" },
    { fileType: FileType.video, extension: "wmv", mimeType: "video/x-ms-asf" },
    { fileType: FileType.video, extension: "hevc", mimeType: "video/hevc" },
    { fileType: FileType.video, extension: "mov", mimeType: "video/quicktime" },
    ...cameraRawExtensions.map((extension) => ({
        fileType: FileType.image,
        extension,
        mimeType: cameraRawMIMETypes[extension],
    })),
];

export const KnownNonMediaFileExtensions = ["xmp", "html", "txt"];
