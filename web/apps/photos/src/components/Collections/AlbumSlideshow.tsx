import {
    collectionDialogIconButtonSx,
    collectionDialogSurfaceStroke,
    collectionDialogSurfaceStrokeDark,
    collectionDialogTitleSx,
    collectionDialogToggleGroupSx,
} from "@/components/CollectionDialog/styles";
import CloseIcon from "@mui/icons-material/Close";
import NavigateBeforeIcon from "@mui/icons-material/NavigateBefore";
import NavigateNextIcon from "@mui/icons-material/NavigateNext";
import PauseIcon from "@mui/icons-material/Pause";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import SettingsIcon from "@mui/icons-material/Settings";
import {
    Box,
    CircularProgress,
    Dialog,
    IconButton,
    Stack,
    ToggleButton,
    ToggleButtonGroup,
    Typography,
    useMediaQuery,
    type Theme,
} from "@mui/material";
import log from "ente-base/log";
import { downloadManager } from "ente-gallery/services/download";
import type { EnteFile } from "ente-media/file";
import { fileFileName } from "ente-media/file-metadata";
import { usePhotosAppContext } from "ente-new/photos/types/context";
import { t } from "i18next";
import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type KeyboardEvent,
    type MouseEvent,
} from "react";
import {
    holdSlideshowWakeLock,
    readSlideshowSettings,
    saveSlideshowSettings,
    scheduleSlideshowAdvance,
    slideshowDurations,
    slideshowIndex,
    type SlideshowSettings,
} from "./album-slideshow";

interface AlbumSlideshowProps {
    files: EnteFile[];
    title: string;
    onClose: () => void;
}

export function AlbumSlideshow({ files, title, onClose }: AlbumSlideshowProps) {
    const [settings, setSettings] = useState(readSlideshowSettings);
    const [slide, setSlide] = useState<{
        index: number;
        ready: boolean;
        automatic: boolean;
        previous?: EnteFile;
    }>({ index: 0, ready: false, automatic: false });
    const [playing, setPlaying] = useState(true);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [visible, setVisible] = useState(() => !document.hidden);
    const [controlsVisible, setControlsVisible] = useState(true);
    const [keyboardFocus, setKeyboardFocus] = useState(false);
    const controlsTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
    const reducedMotion = useMediaQuery("(prefers-reduced-motion: reduce)");
    const { setIsFileViewerOpen } = usePhotosAppContext();
    const current = files[slide.index]!;
    const enabled = playing && visible && !settingsOpen;
    const showControls =
        controlsVisible || !playing || settingsOpen || keyboardFocus;
    const fadeDuration = reducedMotion ? 0 : slide.automatic ? 600 : 200;

    const navigate = useCallback(
        (offset: number, automatic = false) => {
            setSlide((previous) => {
                const index = slideshowIndex(
                    previous.index,
                    offset,
                    files.length,
                );
                return index === previous.index
                    ? previous
                    : {
                          index,
                          ready: false,
                          automatic,
                          previous: files[previous.index],
                      };
            });
        },
        [files],
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
                    enabled,
                    ready: slide.ready,
                    durationSeconds: settings.durationSeconds,
                    count: files.length,
                },
                () => navigate(1, true),
            ),
        [
            enabled,
            slide.ready,
            settings.durationSeconds,
            files.length,
            current.id,
            navigate,
        ],
    );

    useEffect(() => {
        if (!slide.previous) return;
        const timer = setTimeout(
            () =>
                setSlide((previous) => ({ ...previous, previous: undefined })),
            reducedMotion ? 0 : 750,
        );
        return () => clearTimeout(timer);
    }, [current.id, slide.previous, reducedMotion]);

    useEffect(() => {
        const changed = () => setVisible(!document.hidden);
        document.addEventListener("visibilitychange", changed);
        return () => document.removeEventListener("visibilitychange", changed);
    }, []);

    useEffect(() => {
        return enabled ? holdSlideshowWakeLock() : undefined;
    }, [enabled]);

    useEffect(() => {
        setIsFileViewerOpen?.(true);
        return () => setIsFileViewerOpen?.(false);
    }, [setIsFileViewerOpen]);

    useEffect(() => {
        for (
            let offset = 1;
            offset <= Math.min(10, files.length - 1);
            offset++
        ) {
            const file = files[(slide.index + offset) % files.length]!;
            void downloadManager
                .renderableThumbnailURL(file)
                .catch(() => undefined);
            if (offset <= 3)
                void downloadManager
                    .renderableSourceURLs(file)
                    .then((source) =>
                        source.type === "livePhoto"
                            ? source.imageURL()
                            : undefined,
                    )
                    .catch(() => undefined);
        }
    }, [files, slide.index]);

    const revealControls = useCallback(() => {
        setControlsVisible(true);
        clearTimeout(controlsTimer.current);
        if (enabled && !keyboardFocus)
            controlsTimer.current = setTimeout(
                () => setControlsVisible(false),
                3000,
            );
    }, [enabled, keyboardFocus]);

    useEffect(() => {
        revealControls();
        return () => clearTimeout(controlsTimer.current);
    }, [revealControls]);

    const updateSettings = (next: SlideshowSettings) => {
        setSettings(next);
        saveSlideshowSettings(next);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
        if (settingsOpen) return;
        if (event.key === "Tab") {
            setKeyboardFocus(true);
            revealControls();
            return;
        }
        if (
            (event.target as HTMLElement).closest("button") &&
            (event.key === " " || event.key === "Enter")
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
        revealControls();
    };

    const handlePhotoClick = (event: MouseEvent<HTMLElement>) => {
        const bounds = event.currentTarget.getBoundingClientRect();
        const x = (event.clientX - bounds.left) / bounds.width;
        if (files.length > 1 && x < 0.25) navigate(-1);
        else if (files.length > 1 && x > 0.75) navigate(1);
        else setControlsVisible((value) => !value);
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
            <Box
                sx={{ position: "relative", height: "100%", outline: 0 }}
                tabIndex={-1}
                onMouseMove={revealControls}
                onPointerDown={() => setKeyboardFocus(false)}
                onFocus={(event) => {
                    if (event.target.matches("button:focus-visible"))
                        setKeyboardFocus(true);
                }}
                onBlur={(event) => {
                    if (!event.currentTarget.contains(event.relatedTarget))
                        setKeyboardFocus(false);
                }}
            >
                {[slide.previous, current]
                    .filter((file): file is EnteFile => !!file)
                    .map((file) => (
                        <Slide
                            key={file.id}
                            file={file}
                            active={file.id === current.id}
                            fadeDuration={fadeDuration}
                            reducedMotion={reducedMotion}
                            onReady={markReady}
                        />
                    ))}
                <Box
                    onClick={handlePhotoClick}
                    sx={{ position: "absolute", inset: 0 }}
                />
                <Box
                    inert={!showControls}
                    sx={{
                        position: "absolute",
                        inset: 0,
                        zIndex: 3,
                        pointerEvents: "none",
                        opacity: showControls ? 1 : 0,
                        transition: reducedMotion ? "none" : "opacity 200ms",
                        "& button": {
                            pointerEvents: showControls ? "auto" : "none",
                            color: "inherit",
                        },
                    }}
                >
                    <Stack
                        direction="row"
                        sx={{
                            alignItems: "center",
                            p: 2,
                            gap: 2,
                            background: "linear-gradient(#000b, transparent)",
                            position: "absolute",
                            inset: "0 0 auto",
                        }}
                    >
                        <IconButton aria-label={t("close")} onClick={onClose}>
                            <CloseIcon />
                        </IconButton>
                        <Typography
                            id="album-slideshow-title"
                            sx={{ flex: 1 }}
                            noWrap
                        >
                            {title}
                        </Typography>
                        <IconButton
                            aria-label={t("slideshow_settings")}
                            onClick={() => setSettingsOpen(true)}
                        >
                            <SettingsIcon />
                        </IconButton>
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
                </Box>
            </Box>
            <Dialog
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                aria-labelledby="slideshow-settings-title"
                maxWidth={false}
                slotProps={{ paper: { sx: settingsPaperSx } }}
            >
                <Stack sx={{ p: "20px", gap: "32px" }}>
                    <Stack
                        direction="row"
                        sx={{
                            alignItems: "center",
                            justifyContent: "space-between",
                            gap: 2,
                        }}
                    >
                        <Typography
                            component="h2"
                            id="slideshow-settings-title"
                            sx={[
                                collectionDialogTitleSx,
                                {
                                    fontFamily: "'Outfit Variable', sans-serif",
                                    whiteSpace: "normal",
                                },
                            ]}
                        >
                            {t("slideshow_settings")}
                        </Typography>
                        <IconButton
                            aria-label={t("close")}
                            onClick={() => setSettingsOpen(false)}
                            sx={[
                                collectionDialogIconButtonSx,
                                { flexShrink: 0 },
                            ]}
                        >
                            <CloseIcon sx={{ fontSize: 18 }} />
                        </IconButton>
                    </Stack>
                    <Stack sx={{ gap: 3 }}>
                        <Stack sx={{ gap: 1 }}>
                            <Typography sx={settingsLabelSx}>
                                {t("slideshow_time_per_photo")}
                            </Typography>
                            <ToggleButtonGroup
                                exclusive
                                value={settings.durationSeconds}
                                aria-label={t("slideshow_time_per_photo")}
                                sx={[
                                    collectionDialogToggleGroupSx,
                                    {
                                        flexWrap: "wrap",
                                        "& .MuiToggleButtonGroup-grouped": {
                                            flex: "1 0 auto",
                                            minWidth: 52,
                                        },
                                    },
                                ]}
                                onChange={(
                                    _,
                                    durationSeconds: number | null,
                                ) => {
                                    if (durationSeconds !== null)
                                        updateSettings({
                                            ...settings,
                                            durationSeconds,
                                        });
                                }}
                            >
                                {slideshowDurations.map((seconds) => (
                                    <ToggleButton key={seconds} value={seconds}>
                                        {t(
                                            seconds < 60
                                                ? "slideshow_seconds"
                                                : "slideshow_minutes",
                                            {
                                                count:
                                                    seconds < 60
                                                        ? seconds
                                                        : seconds / 60,
                                            },
                                        )}
                                    </ToggleButton>
                                ))}
                            </ToggleButtonGroup>
                        </Stack>
                    </Stack>
                </Stack>
            </Dialog>
        </Dialog>
    );
}

function Slide({
    file,
    active,
    fadeDuration,
    reducedMotion,
    onReady,
}: {
    file: EnteFile;
    active: boolean;
    fadeDuration: number;
    reducedMotion: boolean;
    onReady: (id: number) => void;
}) {
    const [thumbnail, setThumbnail] = useState<string>();
    const [original, setOriginal] = useState<string>();
    const [loaded, setLoaded] = useState(false);
    const [failed, setFailed] = useState(false);
    const [thumbnailLoaded, setThumbnailLoaded] = useState(false);
    useEffect(() => {
        // A quick previous/next can reactivate an already-loaded fading slide.
        if (active && (loaded || thumbnailLoaded)) onReady(file.id);
    }, [active, loaded, thumbnailLoaded, onReady, file.id]);
    useEffect(() => {
        let cancelled = false;
        void downloadManager
            .renderableThumbnailURL(file)
            .then((url) => {
                if (!cancelled) setThumbnail(url);
            })
            .catch(() => undefined);
        void downloadManager
            .renderableSourceURLs(file)
            .then(async (source) => {
                const url =
                    source.type === "image"
                        ? source.imageURL
                        : source.type === "livePhoto"
                          ? await source.imageURL()
                          : undefined;
                if (!cancelled) setOriginal(url);
            })
            .catch((error: unknown) => {
                if (!cancelled) {
                    log.error("Failed to load slideshow photo", error);
                    setFailed(true);
                }
            });
        return () => {
            cancelled = true;
        };
    }, [file]);
    const fade = (duration: number) => ({
        animation:
            active && !reducedMotion
                ? `slideshow-fade ${duration}ms ease-out`
                : "none",
        "@keyframes slideshow-fade": { from: { opacity: 0 } },
    });
    const imageStyle = {
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        objectFit: "contain",
    } as const;
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
                    ...fade(750),
                }}
            />
            <Box
                aria-hidden={!active}
                sx={{
                    // Only backgrounds overlap; old photos show around differing aspect ratios.
                    display: active ? "block" : "none",
                    position: "absolute",
                    inset: 0,
                    zIndex: 1,
                    pointerEvents: "none",
                    ...fade(fadeDuration),
                }}
            >
                {thumbnail && (
                    <Box
                        component="img"
                        src={thumbnail}
                        alt={loaded ? "" : fileFileName(file)}
                        sx={imageStyle}
                        onLoad={() => {
                            setThumbnailLoaded(true);
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
                        }}
                        onError={() => {
                            setOriginal(undefined);
                            setFailed(true);
                        }}
                    />
                )}
                {!loaded && !thumbnailLoaded && (
                    <Stack
                        sx={{
                            height: "100%",
                            alignItems: "center",
                            justifyContent: "center",
                        }}
                    >
                        {failed ? (
                            <Typography>
                                {t("unpreviewable_file_message")}
                            </Typography>
                        ) : (
                            <CircularProgress color="inherit" />
                        )}
                    </Stack>
                )}
            </Box>
        </>
    );
}

const settingsLabelSx = {
    fontSize: 14,
    lineHeight: "20px",
    fontWeight: 500,
    color: "text.muted",
};

const settingsPaperSx = (theme: Theme) => ({
    width: "min(500px, calc(100svw - 32px))",
    maxWidth: "500px",
    m: 2,
    borderRadius: "20px",
    border: `1px solid ${collectionDialogSurfaceStroke}`,
    backgroundColor: "#f4f4f4",
    backgroundImage: "none",
    boxShadow: "none",
    color: "text.base",
    ...theme.applyStyles("dark", {
        borderColor: collectionDialogSurfaceStrokeDark,
        backgroundColor: "#1b1b1b",
    }),
});
