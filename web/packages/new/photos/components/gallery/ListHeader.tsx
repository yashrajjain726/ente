import {
    Box,
    Stack,
    styled,
    Typography,
    type TypographyProps,
} from "@mui/material";
import { isSxArray } from "ente-base/components/utils/sx";
import { t } from "i18next";
import React, { useEffect, useRef, useState } from "react";

interface GalleryItemsSummaryProps {
    name: string;
    description?: string;
    descriptionMaxWidth?: number;
    descriptionOpacity?: number;
    nameProps?: TypographyProps;
    fileCount: number;
    endIcon?: React.ReactNode;
    // This cannot be the only way to invoke the action; it is mouse-only.
    onNameClick?: () => void;
    onDescriptionHeightChange?: (height: number) => void;
}

export const GalleryItemsSummary: React.FC<GalleryItemsSummaryProps> = ({
    name,
    description,
    descriptionMaxWidth,
    descriptionOpacity,
    nameProps,
    fileCount,
    endIcon,
    onNameClick,
    onDescriptionHeightChange,
}) => (
    <Box sx={{ minWidth: 0 }}>
        <Typography variant="h3" {...(nameProps ?? {})} onClick={onNameClick}>
            {name}
        </Typography>

        <Stack
            direction="row"
            sx={{
                gap: 1.5,
                // Keep the header height stable without an end icon.
                minHeight: "24px",
            }}
        >
            <Typography variant="small" sx={{ color: "text.muted" }}>
                {t("photos_count", { count: fileCount })}
            </Typography>
            {endIcon && (
                <Box sx={{ svg: { fontSize: "17px", color: "text.muted" } }}>
                    {endIcon}
                </Box>
            )}
        </Stack>

        <AlbumDescription
            key={description}
            description={description}
            expandable={Boolean(onDescriptionHeightChange)}
            sx={{
                pt: "4px",
                maxWidth: descriptionMaxWidth ?? 420,
                color: "text.muted",
                opacity: descriptionOpacity,
            }}
            onHeightChange={onDescriptionHeightChange}
        />
    </Box>
);

export const galleryItemsDescriptionHeight = 24;

interface AlbumDescriptionProps {
    description?: string;
    expandable?: boolean;
    sx?: TypographyProps["sx"];
    onHeightChange?: (height: number) => void;
}

export const AlbumDescription: React.FC<AlbumDescriptionProps> = ({
    description,
    expandable,
    sx,
    onHeightChange,
}) => {
    const [expansionState, setExpansionState] = useState<
        "collapsed" | "expanded" | "collapsing"
    >("collapsed");
    const [expandedHeight, setExpandedHeight] = useState(
        galleryItemsDescriptionHeight,
    );
    const textRef = useRef<HTMLElement>(null);

    useEffect(() => {
        const text = textRef.current;
        if (!text || (!expandable && !onHeightChange)) return;

        const report = () => {
            setExpandedHeight(text.scrollHeight);
            onHeightChange?.(text.offsetHeight);
        };
        report();
        const observer = new ResizeObserver(report);
        observer.observe(text);
        return () => observer.disconnect();
    }, [description, expandable, onHeightChange]);

    if (!description) return <></>;

    const handleToggle = () => {
        if (expansionState == "collapsed") {
            setExpansionState("expanded");
        } else if (expansionState == "expanded") {
            setExpansionState(
                matchMedia("(prefers-reduced-motion: reduce)").matches
                    ? "collapsed"
                    : "collapsing",
            );
        }
    };

    const handleTransitionEnd: React.TransitionEventHandler<HTMLElement> = (
        event,
    ) => {
        if (
            event.propertyName == "max-height" &&
            expansionState == "collapsing"
        )
            setExpansionState("collapsed");
    };

    return (
        <Typography
            component={expandable ? "button" : "p"}
            ref={(element: HTMLElement | null) => {
                textRef.current = element;
            }}
            type={expandable ? "button" : undefined}
            aria-expanded={
                expandable ? expansionState == "expanded" : undefined
            }
            onClick={expandable ? handleToggle : undefined}
            onTransitionEnd={expandable ? handleTransitionEnd : undefined}
            sx={[
                {
                    display: "-webkit-box",
                    overflow: "hidden",
                    WebkitBoxOrient: "vertical",
                    WebkitLineClamp:
                        expansionState == "collapsed" ? 1 : "unset",
                    overflowWrap: "anywhere",
                    textWrap: "pretty",
                    fontSize: "14px",
                    lineHeight: "20px",
                    ...(expandable && {
                        border: 0,
                        p: 0,
                        background: "none",
                        color: "inherit",
                        textAlign: "left",
                        cursor: "pointer",
                        maxHeight:
                            expansionState == "expanded"
                                ? `${expandedHeight}px`
                                : `${galleryItemsDescriptionHeight}px`,
                        transition: "max-height 140ms ease-out",
                        "@media (prefers-reduced-motion: reduce)": {
                            transition: "none",
                        },
                    }),
                },
                ...(sx ? (isSxArray(sx) ? sx : [sx]) : []),
            ]}
        >
            {description}
        </Typography>
    );
};

export const GalleryItemsHeaderAdapter = styled("div")`
    width: 100%;
    margin-bottom: 12px;
`;
