import { DropdownInput, type DropdownOption } from "@/components/DropdownInput";
import {
    EnteAuthIcon,
    EnteLockerIcon,
    EntePhotosIcon,
} from "@/components/EnteAppIcon";
import ArrowBackIcon from "@mui/icons-material/ArrowBack";
import {
    Box,
    Checkbox,
    Dialog,
    DialogContent,
    DialogTitle,
    FormControlLabel,
    IconButton,
    Link,
    Stack,
    TextField,
    Typography,
} from "@mui/material";
import { SpacedRow } from "ente-base/components/containers";
import { ActivityIndicator } from "ente-base/components/mui/ActivityIndicator";
import { DialogCloseIconButton } from "ente-base/components/mui/DialogCloseIconButton";
import { LoadingButton } from "ente-base/components/mui/LoadingButton";
import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import { useBaseContext } from "ente-base/context";
import { isHTTPErrorWithStatus } from "ente-base/http";
import { formattedNumber } from "ente-base/i18n";
import log from "ente-base/log";
import {
    uploadSheetMediaQuery,
    uploadSheetPaperSx,
    useIsUploadSheet,
} from "ente-gallery/components/upload-progress/bottom-sheet";
import { SlideUpTransition } from "ente-new/photos/components/mui/SlideUpTransition";
import {
    decryptDeleteAccountChallenge,
    deleteAccount,
    getAccountDeleteChallenge,
    getAccountDeletionSummary,
    type AccountDeletionSummary,
} from "ente-new/photos/services/user";
import { initiateEmail } from "ente-new/photos/utils/web";
import { useFormik } from "formik";
import { t } from "i18next";
import React, { useState } from "react";
import { Trans } from "react-i18next";

type DeleteAccountProps = ModalVisibilityProps;

const surfaceRadius = "20px";
const fieldRadius = "16px";
const sheetPadding = "20px";
const sectionGap = "36px";
const bodyFont = { fontSize: "14px", lineHeight: "20px", fontWeight: 500 };
const miniFont = { fontSize: "12px", lineHeight: "16px", fontWeight: 500 };
const titleFont = {
    fontSize: "24px",
    lineHeight: "32px",
    fontWeight: 600,
    [uploadSheetMediaQuery]: { fontSize: "20px", lineHeight: "28px" },
};

const sheetGrey = {
    subtitle: "#999",
    fieldFill: "#212121",
    placeholder: "#969696",
    disabledFill: "#0a0a0a",
    disabledText: "#d6d6d6",
    surface: "#161616",
};

const lightDisabledFill = "#eaeaea";

export const DeleteAccount: React.FC<DeleteAccountProps> = ({
    open,
    onClose,
}) => {
    const isSheet = useIsUploadSheet();

    return (
        <Dialog
            {...{ open, onClose }}
            fullWidth
            slots={isSheet ? { transition: SlideUpTransition } : undefined}
            slotProps={{
                paper: {
                    sx: [
                        (theme) => ({
                            maxWidth: "620px",
                            borderRadius: surfaceRadius,
                            ...theme.applyStyles("dark", {
                                backgroundColor: sheetGrey.surface,
                            }),
                        }),
                        uploadSheetPaperSx,
                    ],
                },
            }}
        >
            <DeleteAccountDialogContents {...{ onClose }} />
        </Dialog>
    );
};

const DeleteAccountDialogContents: React.FC<
    Omit<DeleteAccountProps, "open">
> = ({ onClose }) => {
    const { logout, showMiniDialog, onGenericError } = useBaseContext();

    const [step, setStep] = useState<"reason" | "confirmation">("reason");
    const [acceptDataDeletion, setAcceptDataDeletion] = useState(false);
    const [loading, setLoading] = useState(false);
    const [summaryLoading, setSummaryLoading] = useState(false);
    const [summary, setSummary] = useState<AccountDeletionSummary>();

    const formik = useFormik<{ reason: DeleteReason | ""; feedback: string }>({
        initialValues: { reason: "", feedback: "" },
        validate: ({ reason }) => (reason ? {} : { reason: t("required") }),
        onSubmit: async ({ reason, feedback }) => {
            if (step == "reason") {
                setStep("confirmation");
                setSummaryLoading(true);
                try {
                    setSummary(await getAccountDeletionSummary());
                } catch (e) {
                    if (isHTTPErrorWithStatus(e, 404)) {
                        log.info(
                            "Account deletion summary is not supported by museum",
                        );
                    } else {
                        onGenericError(e);
                    }
                } finally {
                    setSummaryLoading(false);
                }
                return;
            }

            if (summaryLoading || !acceptDataDeletion) return;

            try {
                setLoading(true);
                const { allowDelete, encryptedChallenge } =
                    await getAccountDeleteChallenge();

                if (allowDelete && encryptedChallenge) {
                    const decryptedChallenge =
                        await decryptDeleteAccountChallenge(encryptedChallenge);
                    await deleteAccount(
                        decryptedChallenge,
                        reason,
                        feedback.trim() || undefined,
                    );
                    logout();
                } else {
                    setLoading(false);
                    askToMailForDeletion();
                }
            } catch (e) {
                onGenericError(e);
                setLoading(false);
            }
        },
    });

    const askToMailForDeletion = () => {
        const emailID = "account-deletion@ente.com";

        showMiniDialog({
            title: t("delete_account"),
            message: (
                <Trans
                    i18nKey="delete_account_manually_message"
                    components={{ a: <Link href={`mailto:${emailID}`} /> }}
                    values={{ emailID }}
                />
            ),
            continue: {
                text: t("delete"),
                color: "critical",
                action: () => initiateEmail(emailID),
            },
        });
    };

    const handleBack = () => {
        setAcceptDataDeletion(false);
        setStep("reason");
    };

    const isReasonStep = step == "reason";

    return (
        <form onSubmit={formik.handleSubmit}>
            <DialogTitle
                sx={{ "&&&": { padding: `${sheetPadding} ${sheetPadding} 0` } }}
            >
                <Stack sx={{ gap: "8px" }}>
                    <SpacedRow
                        sx={(theme) => ({
                            gap: "8px",
                            "> .MuiIconButton-root": {
                                padding: "10px",
                                borderRadius: "50%",
                                backgroundColor: "fill.faint",
                                ".MuiSvgIcon-root": {
                                    fontSize: "18px",
                                    color: "text.base",
                                },
                                ...theme.applyStyles("dark", {
                                    backgroundColor: sheetGrey.fieldFill,
                                }),
                            },
                        })}
                    >
                        <Stack
                            direction="row"
                            sx={{ gap: "8px", alignItems: "center" }}
                        >
                            {!isReasonStep && (
                                <IconButton
                                    aria-label={t("delete_account_back")}
                                    color="primary"
                                    onClick={handleBack}
                                    disabled={loading}
                                    sx={{
                                        padding: "7px",
                                        borderRadius: "12px",
                                        ".MuiSvgIcon-root": {
                                            fontSize: "24px",
                                        },
                                    }}
                                >
                                    <ArrowBackIcon />
                                </IconButton>
                            )}
                            <Typography variant="h3" sx={titleFont}>
                                {isReasonStep
                                    ? t("delete_account_reason_title")
                                    : t("delete_account_confirmation_title")}
                            </Typography>
                        </Stack>
                        <DialogCloseIconButton {...{ onClose }} />
                    </SpacedRow>
                    <Typography
                        variant="small"
                        sx={(theme) => ({
                            ...bodyFont,
                            color: "text.muted",
                            ...theme.applyStyles("dark", {
                                color: sheetGrey.subtitle,
                            }),
                        })}
                    >
                        {isReasonStep
                            ? t("delete_account_reason_description")
                            : t("delete_account_confirmation_description")}
                    </Typography>
                </Stack>
            </DialogTitle>
            <DialogContent
                sx={{
                    "&&&": {
                        padding: `0 ${sheetPadding} ${sheetPadding}`,
                        paddingTop: sectionGap,
                        [uploadSheetMediaQuery]: {
                            paddingBottom: `calc(${sheetPadding} + env(safe-area-inset-bottom, 0px))`,
                        },
                    },
                }}
            >
                <Stack sx={{ gap: sectionGap }}>
                    {isReasonStep ? (
                        <Stack sx={{ gap: sectionGap }}>
                            <Stack sx={{ gap: "8px" }}>
                                <Typography
                                    variant="small"
                                    sx={{
                                        ...bodyFont,
                                        display: "flex",
                                        gap: "2px",
                                    }}
                                >
                                    {t("delete_account_reason_short_label")}
                                    <Box
                                        component="span"
                                        sx={{ color: "critical.main" }}
                                    >
                                        {"*"}
                                    </Box>
                                </Typography>
                                <DropdownInput
                                    options={deleteReasonOptions()}
                                    placeholder={t(
                                        "delete_account_reason_placeholder",
                                    )}
                                    selected={formik.values.reason}
                                    onSelect={formik.handleChange("reason")}
                                    sx={(theme) => ({
                                        borderRadius: fieldRadius,
                                        ".MuiSelect-select": {
                                            borderRadius: fieldRadius,
                                            minHeight: "20px",
                                            paddingBlock: "16px",
                                            paddingLeft: "16px",
                                            ...theme.applyStyles("dark", {
                                                backgroundColor:
                                                    sheetGrey.fieldFill,
                                            }),
                                        },
                                        ".MuiSelect-icon": { right: "16px" },
                                        ".MuiOutlinedInput-notchedOutline": {
                                            borderRadius: fieldRadius,
                                        },
                                        "&:hover .MuiOutlinedInput-notchedOutline":
                                            { borderColor: "transparent" },
                                        "&.Mui-focused .MuiOutlinedInput-notchedOutline":
                                            {
                                                borderColor: "stroke.muted",
                                                borderWidth: "1px",
                                            },
                                        "&& .MuiTypography-root": {
                                            ...bodyFont,
                                            ...(!formik.values.reason &&
                                                theme.applyStyles("dark", {
                                                    color: sheetGrey.placeholder,
                                                })),
                                        },
                                    })}
                                />
                                {formik.touched.reason &&
                                    formik.errors.reason && (
                                        <Typography
                                            variant="small"
                                            sx={{
                                                ...bodyFont,
                                                px: 1,
                                                color: "critical.main",
                                            }}
                                        >
                                            {formik.errors.reason}
                                        </Typography>
                                    )}
                            </Stack>
                            <Stack sx={{ gap: "8px" }}>
                                <Typography variant="small" sx={bodyFont}>
                                    {t(
                                        "delete_account_additional_feedback_label",
                                    )}
                                </Typography>
                                <TextField
                                    variant="standard"
                                    margin="none"
                                    multiline
                                    rows={5}
                                    value={formik.values.feedback}
                                    onChange={formik.handleChange("feedback")}
                                    placeholder={t(
                                        "delete_account_feedback_input_placeholder",
                                    )}
                                    sx={(theme) => ({
                                        backgroundColor: "fill.faint",
                                        borderRadius: fieldRadius,
                                        padding: "20px 16px",
                                        ...theme.applyStyles("dark", {
                                            backgroundColor:
                                                sheetGrey.fieldFill,
                                        }),
                                        ".MuiInputBase-formControl": {
                                            padding: 0,
                                            "::before, ::after": {
                                                borderBottom: "none !important",
                                            },
                                        },
                                        ".MuiInputBase-input": {
                                            ...bodyFont,
                                            "::placeholder": {
                                                color: "text.muted",
                                                opacity: 1,
                                                ...theme.applyStyles("dark", {
                                                    color: sheetGrey.placeholder,
                                                }),
                                            },
                                        },
                                    })}
                                />
                            </Stack>
                        </Stack>
                    ) : (
                        <Stack sx={{ gap: "12px" }}>
                            {summaryLoading ? (
                                <Box
                                    sx={{
                                        height: "196px",
                                        display: "flex",
                                        alignItems: "center",
                                        justifyContent: "center",
                                    }}
                                >
                                    <ActivityIndicator
                                        thickness={5}
                                        sx={{ color: "text.base" }}
                                    />
                                </Box>
                            ) : (
                                <Stack sx={{ gap: "8px" }}>
                                    <SummaryRow
                                        icon={<EntePhotosIcon />}
                                        unit={t(
                                            "delete_account_summary_photos_and_videos",
                                        )}
                                        app={t("title_photos")}
                                        count={summary?.photosAndVideosCount}
                                    />
                                    <SummaryRow
                                        icon={<EnteAuthIcon />}
                                        unit={t(
                                            "delete_account_summary_authenticator_codes",
                                        )}
                                        app={t("title_auth")}
                                        count={summary?.authenticatorCodesCount}
                                    />
                                    <SummaryRow
                                        icon={<EnteLockerIcon />}
                                        unit={t(
                                            "delete_account_summary_records",
                                        )}
                                        app={t("title_locker")}
                                        count={summary?.lockerRecordsCount}
                                    />
                                </Stack>
                            )}
                            <FormControlLabel
                                sx={{
                                    margin: 0,
                                    gap: "12px",
                                    alignItems: "flex-start",
                                    paddingBlock: "8px",
                                }}
                                control={
                                    <Checkbox
                                        size="small"
                                        checked={acceptDataDeletion}
                                        disabled={summaryLoading}
                                        onChange={(e) =>
                                            setAcceptDataDeletion(
                                                e.target.checked,
                                            )
                                        }
                                        sx={(theme) => ({
                                            padding: 0,
                                            color: "text.faint",
                                            ...theme.applyStyles("dark", {
                                                color: sheetGrey.placeholder,
                                            }),
                                            "&.Mui-checked": {
                                                color: "critical.main",
                                            },
                                            ".MuiSvgIcon-root": {
                                                fontSize: "20px",
                                            },
                                        })}
                                    />
                                }
                                label={
                                    <Typography variant="small" sx={bodyFont}>
                                        {t(
                                            "delete_account_confirmation_acknowledgement",
                                        )}
                                    </Typography>
                                }
                            />
                        </Stack>
                    )}
                    <LoadingButton
                        type="submit"
                        fullWidth
                        color={isReasonStep ? "primary" : "critical"}
                        disabled={
                            isReasonStep
                                ? !formik.values.reason
                                : summaryLoading || !acceptDataDeletion
                        }
                        loading={loading}
                        sx={(theme) => ({
                            ...bodyFont,
                            fontWeight: 500,
                            height: "48px",
                            padding: "14px 24px",
                            borderRadius: surfaceRadius,
                            ...(isReasonStep &&
                                theme.applyStyles("light", {
                                    backgroundColor: "critical.main",
                                    color: "critical.contrastText",
                                    "&:hover": {
                                        backgroundColor: "critical.dark",
                                    },
                                })),
                            ...(!loading && {
                                "&.Mui-disabled": {
                                    backgroundColor: lightDisabledFill,
                                    ...theme.applyStyles("dark", {
                                        backgroundColor: sheetGrey.disabledFill,
                                        color: sheetGrey.disabledText,
                                    }),
                                },
                            }),
                        })}
                    >
                        {isReasonStep
                            ? t("delete_account_continue")
                            : t("delete_ente_account")}
                    </LoadingButton>
                </Stack>
            </DialogContent>
        </form>
    );
};

interface SummaryRowProps {
    icon: React.ReactNode;
    unit: string;
    app: string;
    count?: number | undefined;
}

const SummaryRow: React.FC<SummaryRowProps> = ({ icon, unit, app, count }) => (
    <Stack
        direction="row"
        sx={(theme) => ({
            gap: "12px",
            alignItems: "center",
            height: "60px",
            paddingInline: "12px",
            borderRadius: surfaceRadius,
            backgroundColor: "fill.faint",
            ...theme.applyStyles("dark", {
                backgroundColor: sheetGrey.fieldFill,
            }),
        })}
    >
        <Box sx={{ lineHeight: 0, flexShrink: 0 }}>{icon}</Box>
        <Stack sx={{ gap: "4px" }}>
            <Typography variant="small" sx={bodyFont}>
                {count == undefined
                    ? unit
                    : `${formattedNumber(count)} ${unit}`}
            </Typography>
            <Typography
                variant="mini"
                sx={(theme) => ({
                    ...miniFont,
                    color: "text.muted",
                    ...theme.applyStyles("dark", { color: sheetGrey.subtitle }),
                })}
            >
                {app}
            </Typography>
        </Stack>
    </Stack>
);

const deleteReasons = [
    "missing_feature",
    "unexpected_behaviour",
    "found_another_service",
    "not_listed",
] as const;

type DeleteReason = (typeof deleteReasons)[number];

const deleteReasonOptions = (): DropdownOption<DeleteReason>[] =>
    deleteReasons.map((reason) => ({
        label: t(
            `delete_reason.${reason == "unexpected_behaviour" ? "behaviour" : reason}`,
        ),
        value: reason,
    }));
