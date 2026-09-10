import { lockerColorSx } from "@/styles/tokens";
import CheckCircleRoundedIcon from "@mui/icons-material/CheckCircleRounded";
import ClearRoundedIcon from "@mui/icons-material/ClearRounded";
import DeleteOutlinedIcon from "@mui/icons-material/DeleteOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import { Box, Button, IconButton, Stack, Typography } from "@mui/material";
import { t } from "i18next";
import React from "react";

export const SelectionActionBar: React.FC<{
    selectedCount: number;
    allSelected: boolean;
    bulkDownloading: boolean;
    bulkDownloadProgress: { completed: number; total: number } | null;
    canDownload: boolean;
    canDelete: boolean;
    onToggleSelectAll: () => void;
    onDownload: () => void;
    onDelete: () => void;
    onDone: () => void;
}> = ({
    selectedCount,
    allSelected,
    bulkDownloading,
    bulkDownloadProgress,
    canDownload,
    canDelete,
    onToggleSelectAll,
    onDownload,
    onDelete,
    onDone,
}) => (
    <Box sx={{ px: { xs: 2, sm: 3 }, py: { xs: 1.25, sm: 1.5 } }}>
        <Box
            sx={(theme) => ({
                maxWidth: 760,
                mx: "auto",
                borderRadius: "20px",
                border: `1px solid ${theme.vars.palette.stroke.faint}`,
                backgroundColor: theme.vars.palette.background.paper,
                boxShadow: "0 12px 30px rgba(15, 23, 42, 0.12)",
                backdropFilter: "blur(18px)",
                px: { xs: 1.25, sm: 1.5 },
                py: 1.25,
            })}
        >
            <Stack
                direction={{ xs: "column", sm: "row" }}
                sx={{
                    alignItems: { xs: "stretch", sm: "center" },
                    justifyContent: "space-between",
                    gap: 1,
                }}
            >
                <Stack
                    direction="row"
                    sx={{
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: 1,
                    }}
                >
                    <Box
                        sx={{
                            display: "flex",
                            alignItems: "center",
                            gap: 1,
                            minWidth: 0,
                            px: 1.25,
                            py: 0.875,
                            borderRadius: "14px",
                            backgroundColor: "rgba(16, 113, 255, 0.10)",
                            border: "1px solid rgba(16, 113, 255, 0.16)",
                        }}
                    >
                        <CheckCircleRoundedIcon
                            sx={(theme) => ({
                                fontSize: 18,
                                ...lockerColorSx(theme, { color: "primary" }),
                                flexShrink: 0,
                            })}
                        />
                        <Typography
                            variant="body"
                            sx={{ fontWeight: 600, minWidth: 0 }}
                            noWrap
                        >
                            {t("filesSelected", { count: selectedCount })}
                        </Typography>
                    </Box>
                    <IconButton
                        onClick={onDone}
                        disabled={bulkDownloading}
                        sx={(theme) => ({
                            color: "text.muted",
                            width: 38,
                            height: 38,
                            flexShrink: 0,
                            border: `1px solid ${theme.vars.palette.stroke.faint}`,
                            backgroundColor: theme.vars.palette.fill.faint,
                            "&:hover": {
                                backgroundColor:
                                    theme.vars.palette.fill.faintHover,
                            },
                        })}
                    >
                        <ClearRoundedIcon sx={{ fontSize: 18 }} />
                    </IconButton>
                </Stack>
                <Stack
                    direction={{ xs: "column", sm: "row" }}
                    sx={{ alignItems: { xs: "stretch", sm: "center" }, gap: 1 }}
                >
                    <Button
                        color="secondary"
                        onClick={onToggleSelectAll}
                        disabled={bulkDownloading}
                        sx={(theme) => ({
                            minHeight: 42,
                            px: 1.5,
                            borderRadius: "14px",
                            border: `1px solid ${theme.vars.palette.stroke.faint}`,
                            backgroundColor: theme.vars.palette.fill.faint,
                            "&:hover": {
                                backgroundColor:
                                    theme.vars.palette.fill.faintHover,
                            },
                        })}
                    >
                        {allSelected ? t("deselectAll") : t("selectAll")}
                    </Button>
                    <Button
                        variant="contained"
                        startIcon={<FileDownloadOutlinedIcon />}
                        onClick={onDownload}
                        disabled={bulkDownloading || !canDownload}
                        sx={{
                            minHeight: 42,
                            px: 1.75,
                            borderRadius: "14px",
                            boxShadow: "none",
                            color: "#FFFFFF",
                            background:
                                "linear-gradient(180deg, #1674FF 0%, #0B5FE0 100%)",
                            "& .MuiButton-startIcon": { color: "#FFFFFF" },
                            "&:hover": {
                                boxShadow: "none",
                                background:
                                    "linear-gradient(180deg, #2A82FF 0%, #1269F0 100%)",
                            },
                        }}
                    >
                        {bulkDownloading && bulkDownloadProgress
                            ? `${t("downloading")} ${bulkDownloadProgress.completed}/${bulkDownloadProgress.total}`
                            : t("download")}
                    </Button>
                    <Button
                        color="critical"
                        startIcon={<DeleteOutlinedIcon />}
                        onClick={onDelete}
                        disabled={bulkDownloading || !canDelete}
                        sx={{
                            minHeight: 42,
                            px: 1.75,
                            borderRadius: "14px",
                            color: "#FFFFFF",
                            border: "1px solid rgba(185, 28, 28, 0.26)",
                            backgroundColor: "#D14343",
                            "& .MuiButton-startIcon": { color: "#FFFFFF" },
                            "&:hover": { backgroundColor: "#B93838" },
                        }}
                    >
                        {t("delete")}
                    </Button>
                </Stack>
            </Stack>
        </Box>
    </Box>
);
