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
    endIcon?: React.ReactNode;
    // This cannot be the only way to invoke the action; it is mouse-only.
    onNameClick?: () => void;
}

export const GalleryItemsSummary: React.FC<GalleryItemsSummaryProps> = ({
    name,
    nameProps,
    fileCount,
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
    </div>
);

export const GalleryItemsHeaderAdapter = styled("div")`
    width: 100%;
    margin-bottom: 12px;
`;
