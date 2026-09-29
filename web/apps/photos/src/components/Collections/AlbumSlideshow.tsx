import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import {
    Box,
    CircularProgress,
    Dialog,
    IconButton,
    Stack,
    Typography,
} from "@mui/material";
import { CenteredFill } from "ente-base/components/containers";
import log from "ente-base/log";
import { downloadManager } from "ente-gallery/services/download";
import type { EnteFile } from "ente-media/file";
import { fileFileName } from "ente-media/file-metadata";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { t } from "i18next";
import {
    useCallback,
    useEffect,
    useState,
    type KeyboardEvent,
    type MouseEvent,
} from "react";
import { scheduleSlideshowAdvance, slideshowIndex } from "./album-slideshow";

interface AlbumSlideshowProps {
    files: EnteFile[];
    title: string;
    onClose: () => void;
}

export function AlbumSlideshow({ files, title, onClose }: AlbumSlideshowProps) {
    const [slide, setSlide] = useState({ index: 0, ready: false });
    const [playing, setPlaying] = useState(true);
    const [visible, setVisible] = useState(() => !document.hidden);
    const { setIsFileViewerOpen } = usePhotosAppContext();
    const current = files[slide.index]!;

    const navigate = useCallback(
        (offset: number) => {
            setSlide((previous) => {
                const index = slideshowIndex(
                    previous.index,
                    offset,
                    files.length,
                );
                return index === previous.index
                    ? previous
                    : { index, ready: false };
            });
        },
        [files.length],
    );

    const markReady = useCallback(
        (id: number) => {
            setSlide((previous) =>
                files[previous.index]?.id === id && !previous.ready
                    ? { ...previous, ready: true }
                    : previous,
            );
        },
        [files],
    );

    useEffect(
        () =>
            scheduleSlideshowAdvance(
                {
                    enabled: playing && visible,
                    ready: slide.ready,
                    count: files.length,
                },
                () => navigate(1),
            ),
        [playing, visible, slide.ready, files.length, current.id, navigate],
    );

    useEffect(() => {
        const changed = () => setVisible(!document.hidden);
        document.addEventListener("visibilitychange", changed);
        return () => document.removeEventListener("visibilitychange", changed);
    }, []);

    useEffect(() => {
        setIsFileViewerOpen?.(true);
        return () => setIsFileViewerOpen?.(false);
    }, [setIsFileViewerOpen]);

    const handleKeyDown = (event: KeyboardEvent) => {
        if (
            (event.target as HTMLElement).closest("button") &&
            event.key === " "
        )
            return;
        switch (event.key) {
            case "ArrowLeft":
                navigate(-1);
                break;
            case "ArrowRight":
                navigate(1);
                break;
            case " ":
                if (files.length > 1) setPlaying((value) => !value);
                break;
            default:
                return;
        }
        event.preventDefault();
        event.stopPropagation();
    };

    const handlePhotoClick = (event: MouseEvent<HTMLElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        if (x < 0.25) navigate(-1);
        else if (x > 0.75) navigate(1);
    };

    return (
        <Dialog
            open
            fullScreen
            onClose={onClose}
            aria-labelledby="album-slideshow-title"
            onKeyDown={handleKeyDown}
            slotProps={{
                paper: {
                    sx: { bgcolor: "#000", color: "#fff", overflow: "hidden" },
                },
            }}
        >
            <Slide key={current.id} file={current} onReady={markReady} />
            <Box
                onClick={handlePhotoClick}
                sx={{ position: "absolute", inset: 0 }}
            />
            <Stack
                direction="row"
                sx={{
                    position: "relative",
                    alignItems: "center",
                    p: 2,
                    gap: 2,
                    background: "linear-gradient(#000b, transparent)",
                }}
            >
                <IconButton
                    aria-label={t("close")}
                    onClick={onClose}
                    color="inherit"
                >
                    <CloseIcon />
                </IconButton>
                <Typography id="album-slideshow-title" noWrap>
                    {title}
                </Typography>
            </Stack>
            {files.length > 1 && (
                <Stack
                    direction="row"
                    sx={{
                        position: "absolute",
                        top: "50%",
                        width: "100%",
                        transform: "translateY(-50%)",
                        alignItems: "center",
                        justifyContent: "space-between",
                        px: 2,
                        pointerEvents: "none",
                        "& button": { pointerEvents: "auto", color: "inherit" },
                    }}
                >
                    <IconButton
                        aria-label={t("previous")}
                        onClick={() => navigate(-1)}
                    >
                        <NavigateBeforeIcon />
                    </IconButton>
                    <IconButton
                        aria-label={t(playing ? "pause" : "play")}
                        onClick={() => setPlaying((value) => !value)}
                        sx={{ bgcolor: "#0007", width: 56, height: 56 }}
                    >
                        {playing ? <PauseIcon /> : <PlayArrowIcon />}
                    </IconButton>
                    <IconButton
                        aria-label={t("next")}
                        onClick={() => navigate(1)}
                    >
                        <NavigateNextIcon />
                    </IconButton>
                </Stack>
            )}
        </Dialog>
    );
}

function Slide({
    file,
    onReady,
}: {
    file: EnteFile;
    onReady: (id: number) => void;
}) {
    const [thumbnail, setThumbnail] = useState<string>();
    const [original, setOriginal] = useState<string>();
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [thumbnailLoaded, setThumbnailLoaded] = useState(false);

    useEffect(() => {
        let cancelled = false;
        const isCancelled = () => cancelled;
        let livePhotoURL: string | undefined;
        void downloadManager
            .renderableThumbnailURL(file)
            .then((url) => {
                if (!isCancelled()) setThumbnail(url);
            })
            .catch(() => undefined);
        void downloadManager
            .renderableSourceURLs(file)
            .then(async (source) => {
                if (isCancelled()) return;
                if (source.type === "livePhoto") {
                    const url = await source.imageURL();
                    if (isCancelled()) {
                        URL.revokeObjectURL(url);
                    } else {
                        // Only Live Photo still URLs are owned by this slide.
                        livePhotoURL = url;
                        setOriginal(url);
                    }
                } else if (source.type === "image") {
                    setOriginal(source.imageURL);
                }
            })
            .catch((error: unknown) => {
                if (!isCancelled()) {
                    log.error("Failed to load slideshow photo", error);
                    setFailed(true);
                }
            });
        return () => {
            cancelled = true;
            if (livePhotoURL) URL.revokeObjectURL(livePhotoURL);
        };
    }, [file]);

    return (
        <>
            <Box
                aria-hidden
                sx={{
                    position: "absolute",
                    inset: -100,
                    backgroundImage: `url("${thumbnail ?? original ?? ""}")`,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    filter: "blur(100px)",
                    opacity: 0.6,
                }}
            />
            {thumbnail && (
                <Box
                    component="img"
                    src={thumbnail}
                    alt={loaded ? "" : fileFileName(file)}
                    sx={imageStyle}
                    onLoad={() => {
                        setThumbnailLoaded(true);
                        onReady(file.id);
                    }}
                />
            )}
            {original && (
                <Box
                    component="img"
                    src={original}
                    alt={loaded ? fileFileName(file) : ""}
                    sx={{ ...imageStyle, opacity: loaded ? 1 : 0 }}
                    onLoad={() => {
                        setLoaded(true);
                        onReady(file.id);
                    }}
                    onError={() => {
                        setOriginal(undefined);
                        setFailed(true);
                    }}
                />
            )}
            {!loaded && !thumbnailLoaded && (
                <CenteredFill sx={{ position: "absolute", inset: 0 }}>
                    {failed ? (
                        <Typography>
                            {t("unpreviewable_file_message")}
                        </Typography>
                    ) : (
                        <CircularProgress color="inherit" />
                    )}
                </CenteredFill>
            )}
        </>
    );
}

const imageStyle = {
    position: "absolute",
    inset: 0,
    width: "100%",
    height: "100%",
    objectFit: "contain",
} as const;
