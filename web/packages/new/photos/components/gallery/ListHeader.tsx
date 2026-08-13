import {
    Box,
    Stack,
    styled,
    Typography,
    type TypographyProps,
} from "@mui/material";
import { t } from "i18next";
import React from "react";

interface GalleryItemsSummaryProps {
    name: string;
    nameProps?: TypographyProps;
    fileCount: number;
    description?: string;
    endIcon?: React.ReactNode;
    // This cannot be the only way to invoke the action; it is mouse-only.
    onNameClick?: () => void;
}

const descriptionMaxLines = 3;
const descriptionLineHeight = 17;
const descriptionTopSpacing = 8;

// ponytail: fixed 3-line reserve, measure if short descriptions leave visible slack.
export const galleryItemsSummaryDescriptionHeight =
    descriptionTopSpacing + descriptionMaxLines * descriptionLineHeight;

export const GalleryItemsSummary: React.FC<GalleryItemsSummaryProps> = ({
    name,
    nameProps,
    fileCount,
    description,
    endIcon,
    onNameClick,
}) => (
    <div>
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
        {description?.trim() && (
            <Typography
                variant="small"
                sx={{
                    color: "text.muted",
                    mt: `${descriptionTopSpacing}px`,
                    height: `${descriptionMaxLines * descriptionLineHeight}px`,
                    lineHeight: `${descriptionLineHeight}px`,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    display: "-webkit-box",
                    WebkitLineClamp: descriptionMaxLines,
                    WebkitBoxOrient: "vertical",
                }}
            >
                {description.trim()}
            </Typography>
        )}
    </div>
);

export const GalleryItemsHeaderAdapter = styled("div")`
    width: 100%;
    margin-bottom: 12px;
`;
