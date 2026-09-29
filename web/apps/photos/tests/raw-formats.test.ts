import { renderableImageBlobWeb } from "ente-gallery/services/convert-core";
import { detectFileTypeInfo } from "ente-gallery/utils/detect-type";
import { FileType } from "ente-media/file-type";
import { needsJPEGConversion } from "ente-media/formats";
import { describe, expect, test, vi } from "vitest";

vi.mock("ente-base/log", () => ({
    default: { debug: vi.fn(), info: vi.fn(), error: vi.fn() },
}));
vi.mock("ente-media/heic-convert", () => ({ heicToJPEG: vi.fn() }));

// The public extension contract of the bundled libvips 8.18.7 RAW loader.
const rawExtensions = (
    "3fr ari arw cap cin cr2 cr3 crw dcr dng erf fff iiq k25 kdc mdc " +
    "mos mrw nef nrw orf ori pef pxn raf raw rw2 rwl sr2 srf srw x3f"
).split(" ");

// Intentionally unrecognized bytes exercise the filename fallback, not decoding.
const unknownBytes = new Uint8Array([0, 1, 2, 3]);

// A minimal TIFF with an empty IFD. RAW files sharing this signature retain the
// detected TIFF type; the native converter also needs their original filename.
const tiffBytes = new Uint8Array([
    0x49, 0x49, 0x2a, 0, 8, 0, 0, 0, 0, 0, 0, 0, 0, 0,
]);

// These recognizable headers exercise file-type rather than filename fallback.
const rawHeaders = [
    {
        extension: "orf",
        bytes: new Uint8Array([0x49, 0x49, 0x52, 0x4f, 8, 0, 0, 0, 0x18]),
    },
    { extension: "raf", bytes: new TextEncoder().encode("FUJIFILMCCD-RAW") },
];

describe("camera RAW format support", () => {
    test.each(rawExtensions)(
        "accepts an undetected .%s image and requests native JPEG conversion",
        async (extension) => {
            const fileName = `photo.${extension.toUpperCase()}`;
            const file = new File([unknownBytes], fileName);
            expect(await detectFileTypeInfo(file)).toMatchObject({
                fileType: FileType.image,
                extension,
            });

            // ML fallback and browser editing/casting checks use the filename
            // extension, independently of content-based type detection.
            expect(needsJPEGConversion(extension.toUpperCase())).toBe(true);

            const jpeg = new Blob(["converted"], { type: "image/jpeg" });
            const convertToJPEG = vi.fn().mockResolvedValue(jpeg);
            expect(
                await renderableImageBlobWeb(file, fileName, { convertToJPEG }),
            ).toBe(jpeg);
            expect(convertToJPEG).toHaveBeenCalledExactlyOnceWith(
                file,
                extension,
                fileName,
            );
        },
    );

    test.each(rawHeaders)(
        "converts content-detected $extension files",
        async ({ extension, bytes }) => {
            const file = new File([bytes], `photo.${extension}`);
            expect(await detectFileTypeInfo(file)).toMatchObject({ extension });
            const jpeg = new Blob(["converted"], { type: "image/jpeg" });
            const convertToJPEG = vi.fn().mockResolvedValue(jpeg);
            expect(
                await renderableImageBlobWeb(file, file.name, {
                    convertToJPEG,
                }),
            ).toBe(jpeg);
            expect(convertToJPEG).toHaveBeenCalledExactlyOnceWith(
                file,
                extension,
                file.name,
            );
        },
    );

    test("passes the original RAW filename when contents are detected as TIFF", async () => {
        const file = new File([tiffBytes], "photo.PEF");
        const convertToJPEG = vi.fn().mockResolvedValue(new Blob());
        expect(await detectFileTypeInfo(file)).toMatchObject({
            extension: "tif",
        });
        await renderableImageBlobWeb(file, file.name, { convertToJPEG });
        expect(convertToJPEG).toHaveBeenCalledExactlyOnceWith(
            file,
            "tif",
            "photo.PEF",
        );
    });

    test("preserves content detection for a JPEG with a RAW filename", async () => {
        const file = new File(
            [new Uint8Array([0xff, 0xd8, 0xff, 0xe0])],
            "photo.RAW",
        );
        expect(await detectFileTypeInfo(file)).toEqual({
            fileType: FileType.image,
            extension: "jpg",
            mimeType: "image/jpeg",
        });
        const convertToJPEG = vi.fn();
        const result = await renderableImageBlobWeb(file, file.name, {
            convertToJPEG,
        });
        expect(result.type).toBe("image/jpeg");
        expect(convertToJPEG).not.toHaveBeenCalled();
    });

    test("keeps original bytes when the platform decoder does not support a RAW file", async () => {
        const file = new File([unknownBytes], "photo.x3f");
        const error = new Error(
            "Camera is not supported by the native decoder",
        );
        const convertToJPEG = vi.fn().mockRejectedValue(error);
        const onConvertToJPEGError = vi.fn();
        expect(
            await renderableImageBlobWeb(file, file.name, {
                convertToJPEG,
                onConvertToJPEGError,
            }),
        ).toBe(file);
        expect(onConvertToJPEGError).toHaveBeenCalledExactlyOnceWith(error);
    });

    test("leaves RAW bytes unchanged when no native converter is available", async () => {
        const file = new File([unknownBytes], "photo.x3f");
        expect(await renderableImageBlobWeb(file, file.name)).toBe(file);
    });

    test.each([
        ["crw", "image/x-canon-crw"],
        ["orf", "image/x-olympus-orf"],
        ["raf", "image/x-fuji-raf"],
    ])(
        "retains the existing .%s fallback MIME type",
        async (extension, mimeType) => {
            expect(
                await detectFileTypeInfo(
                    new File([unknownBytes], `photo.${extension}`),
                ),
            ).toMatchObject({ mimeType });
        },
    );

    test("still rejects files without a recognized media type or extension", async () => {
        await expect(
            detectFileTypeInfo(new File([unknownBytes], "notes.txt")),
        ).rejects.toThrow("Unsupported file format");
    });
});
