import type { SocialViewerPhoto } from "components/SocialFileViewer";

export interface LocalPostPhotoDimensions {
    height: number;
    width: number;
}

export interface LocalPostPhoto {
    objectUrl: string;
    photo: SocialViewerPhoto;
}

interface CreateLocalPostPhotoAttributes {
    avatarUrl?: string | null;
    file: File;
    name: string;
    onDimensionsLoaded?: (
        objectUrl: string,
        dimensions: LocalPostPhotoDimensions,
    ) => void;
}

export const createLocalPostPhoto = ({
    avatarUrl,
    file,
    name,
    onDimensionsLoaded,
}: CreateLocalPostPhotoAttributes): LocalPostPhoto => {
    const objectUrl = URL.createObjectURL(file);
    const photo: SocialViewerPhoto = {
        alt: `${name} post`,
        avatarUrl,
        imageUrl: objectUrl,
        name,
        timestampMs: Date.now(),
    };

    const image = new Image();
    image.onload = () => {
        const { naturalHeight, naturalWidth } = image;
        if (naturalHeight <= 0 || naturalWidth <= 0) return;

        onDimensionsLoaded?.(objectUrl, {
            height: naturalHeight,
            width: naturalWidth,
        });
    };
    image.src = objectUrl;

    return { objectUrl, photo };
};
