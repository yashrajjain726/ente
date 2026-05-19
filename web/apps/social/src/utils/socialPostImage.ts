import { lowercaseExtension, nameAndExtension } from "ente-base/file-name";
import { isHEICExtension } from "ente-media/formats";
import { heicToJPEG } from "ente-media/heic-convert";

export interface PreparedSocialImage {
    file: File;
    height: number;
    width: number;
}

export type PreparedSocialAvatarImage = PreparedSocialImage;
export type PreparedSocialPostImage = PreparedSocialImage;

export interface SocialAvatarCropImage {
    url: string;
}

export interface SocialImageCropArea {
    height: number;
    width: number;
    x: number;
    y: number;
}

export const socialAvatarImageInputAccept =
    "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";
export const socialPostImageInputAccept =
    "image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic,.heif";

const socialAvatarImageMaxEdge = 512;
const socialPostImageMaxLongEdge = 2560;
const socialPostImageWebPQuality = 0.85;
const socialPostImageMimeType = "image/webp";

export const prepareSocialPostImage = async (
    file: File,
): Promise<PreparedSocialPostImage> => {
    const renderableBlob = await renderableBlobForSocialImage(file);
    const { blob, height, width } = await webPBlobFromImage(
        renderableBlob,
        postCanvasPlan,
    );

    return {
        file: new File([blob], webPFileName(file.name), {
            lastModified: file.lastModified || Date.now(),
            type: socialPostImageMimeType,
        }),
        height,
        width,
    };
};

export const prepareSocialAvatarImage = async (
    file: File,
): Promise<PreparedSocialAvatarImage> => {
    const renderableBlob = await renderableBlobForSocialImage(file);
    const { blob, height, width } = await webPBlobFromImage(
        renderableBlob,
        avatarCanvasPlan,
    );

    return {
        file: new File([blob], webPFileName(file.name), {
            lastModified: file.lastModified || Date.now(),
            type: socialPostImageMimeType,
        }),
        height,
        width,
    };
};

export const socialAvatarCropImageForFile = async (
    file: File,
): Promise<SocialAvatarCropImage> => {
    const renderableBlob = await renderableBlobForSocialImage(file);
    const imageURL = URL.createObjectURL(renderableBlob);

    try {
        await loadImage(imageURL);
        return { url: imageURL };
    } catch (error) {
        URL.revokeObjectURL(imageURL);
        throw error;
    }
};

export const prepareSocialAvatarImageFromCrop = async (
    file: File,
    imageURL: string,
    cropArea: SocialImageCropArea,
): Promise<PreparedSocialAvatarImage> => {
    const { blob, height, width } = await webPBlobFromImage(
        imageURL,
        (width, height) => avatarCanvasPlanForCrop(width, height, cropArea),
        false,
    );

    return {
        file: new File([blob], webPFileName(file.name), {
            lastModified: file.lastModified || Date.now(),
            type: socialPostImageMimeType,
        }),
        height,
        width,
    };
};

const renderableBlobForSocialImage = async (file: File): Promise<Blob> => {
    const extension = lowercaseExtension(file.name);
    const mediaType = file.type.toLowerCase();
    const isHEIC =
        (extension != undefined && isHEICExtension(extension)) ||
        mediaType == "image/heic" ||
        mediaType == "image/heif";

    return isHEIC ? await heicToJPEG(file) : file;
};

interface CanvasPlan {
    height: number;
    sourceHeight: number;
    sourceWidth: number;
    sourceX: number;
    sourceY: number;
    width: number;
}

const webPBlobFromImage = async (
    imageSource: Blob | string,
    planForSource: (width: number, height: number) => CanvasPlan,
    revokeImageURL = true,
): Promise<{ blob: Blob; height: number; width: number }> => {
    const imageURL =
        typeof imageSource == "string"
            ? imageSource
            : URL.createObjectURL(imageSource);
    try {
        const image = await loadImage(imageURL);
        const plan = planForSource(
            image.naturalWidth || image.width,
            image.naturalHeight || image.height,
        );
        if (plan.width <= 0 || plan.height <= 0) {
            throw new Error("Invalid image dimensions");
        }

        const canvas = document.createElement("canvas");
        canvas.width = plan.width;
        canvas.height = plan.height;

        const context = canvas.getContext("2d");
        if (!context) throw new Error("Could not create image canvas");

        context.drawImage(
            image,
            plan.sourceX,
            plan.sourceY,
            plan.sourceWidth,
            plan.sourceHeight,
            0,
            0,
            plan.width,
            plan.height,
        );

        return {
            blob: await canvasToBlob(canvas, socialPostImageMimeType),
            height: plan.height,
            width: plan.width,
        };
    } finally {
        if (revokeImageURL) URL.revokeObjectURL(imageURL);
    }
};

const loadImage = async (imageURL: string) =>
    await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.decoding = "async";
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("Could not decode image"));
        image.src = imageURL;
    });

const postCanvasPlan = (width: number, height: number): CanvasPlan => {
    const dimensions = scaledDimensions(
        width,
        height,
        socialPostImageMaxLongEdge,
    );
    return {
        ...dimensions,
        sourceHeight: height,
        sourceWidth: width,
        sourceX: 0,
        sourceY: 0,
    };
};

const avatarCanvasPlan = (width: number, height: number): CanvasPlan => {
    if (width <= 0 || height <= 0) {
        return {
            height: 0,
            sourceHeight: 0,
            sourceWidth: 0,
            sourceX: 0,
            sourceY: 0,
            width: 0,
        };
    }

    const sourceEdge = Math.min(width, height);
    const outputEdge = Math.min(sourceEdge, socialAvatarImageMaxEdge);
    return {
        height: outputEdge,
        sourceHeight: sourceEdge,
        sourceWidth: sourceEdge,
        sourceX: Math.floor((width - sourceEdge) / 2),
        sourceY: Math.floor((height - sourceEdge) / 2),
        width: outputEdge,
    };
};

const avatarCanvasPlanForCrop = (
    width: number,
    height: number,
    cropArea: SocialImageCropArea,
): CanvasPlan => {
    if (width <= 0 || height <= 0) {
        return {
            height: 0,
            sourceHeight: 0,
            sourceWidth: 0,
            sourceX: 0,
            sourceY: 0,
            width: 0,
        };
    }

    const sourceEdge = Math.min(
        Math.max(1, Math.min(cropArea.width, cropArea.height)),
        width,
        height,
    );
    const outputEdge = socialAvatarImageMaxEdge;

    return {
        height: outputEdge,
        sourceHeight: sourceEdge,
        sourceWidth: sourceEdge,
        sourceX: clampNumber(cropArea.x, 0, Math.max(0, width - sourceEdge)),
        sourceY: clampNumber(cropArea.y, 0, Math.max(0, height - sourceEdge)),
        width: outputEdge,
    };
};

const scaledDimensions = (
    width: number,
    height: number,
    maxLongEdge: number,
): { height: number; width: number } => {
    if (width <= 0 || height <= 0) return { height: 0, width: 0 };

    const longEdge = Math.max(width, height);
    if (longEdge <= maxLongEdge) {
        return { height, width };
    }

    const scale = maxLongEdge / longEdge;
    return {
        height: Math.max(1, Math.round(height * scale)),
        width: Math.max(1, Math.round(width * scale)),
    };
};

const clampNumber = (value: number, min: number, max: number) =>
    Math.min(Math.max(value, min), max);

const canvasToBlob = async (
    canvas: HTMLCanvasElement,
    mediaType: string,
): Promise<Blob> => {
    const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, mediaType, socialPostImageWebPQuality),
    );
    if (!blob) throw new Error("Could not encode image");
    return blob;
};

const webPFileName = (fileName: string) => {
    const [name] = nameAndExtension(fileName.trim());
    return `${name || "post"}.webp`;
};
