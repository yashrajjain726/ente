import { InformationCircleIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { CircularProgress, styled } from "@mui/material";
import { pt } from "ente-base/i18n";
import type { DevSettingsPresentationProps } from "ente-new/photos/components/DevSettings";
import { t } from "i18next";
import type React from "react";
import {
    AuthDialog,
    AuthDialogHeader,
    AuthDialogText,
    AuthDialogTitle,
} from "./AuthDialog";
import { Button } from "./Button";
import {
    authBodyTypography,
    authDialogContentLayout,
    authFocusRing,
} from "./styles";
import { TextField } from "./TextField";

/** Photos styling for the shared developer-settings controller. */
export function DevSettingsDialog({
    open,
    onDialogClose,
    value,
    onChange,
    onBlur,
    error,
    isChecking,
    canSave,
    onSubmit,
    onClose,
}: DevSettingsPresentationProps): React.JSX.Element {
    return (
        <AuthDialog
            open={open}
            onClose={onDialogClose}
            ariaLabelledby="developer-settings-title"
        >
            <FormRoot onSubmit={onSubmit}>
                <AuthDialogHeader>
                    <AuthDialogTitle id="developer-settings-title">
                        {t("developer_settings")}
                    </AuthDialogTitle>
                    <AuthDialogText>
                        {pt(
                            "Point this app at your own Ente server. Leave it blank to use api.ente.io.",
                        )}
                    </AuthDialogText>
                </AuthDialogHeader>
                <TextField
                    name="apiOrigin"
                    label={t("server_endpoint")}
                    value={value}
                    onChange={onChange}
                    onBlur={onBlur}
                    placeholder="https://api.example.org"
                    autoFocus
                    disabled={isChecking}
                    error={Boolean(error)}
                    helperText={
                        error == "Invalid endpoint"
                            ? pt("Enter a full URL, including https://")
                            : error
                              ? pt("Could not reach this endpoint")
                              : undefined
                    }
                    trailing={
                        <InfoLink
                            href="https://ente.com/help/self-hosting/installation/post-install/#step-6-configure-apps-to-use-your-server"
                            target="_blank"
                            rel="noopener"
                            aria-label={t("more_information")}
                        >
                            <HugeiconsIcon
                                icon={InformationCircleIcon}
                                size={20}
                                strokeWidth={2}
                                aria-hidden="true"
                            />
                        </InfoLink>
                    }
                />
                {isChecking && (
                    <StatusPill role="status">
                        <CircularProgress
                            size={18}
                            sx={{ color: "var(--photos-auth-primary)" }}
                        />
                        <span>{pt("Checking the endpoint is reachable")}</span>
                    </StatusPill>
                )}
                <ButtonRow>
                    <Button
                        type="submit"
                        variant="primary"
                        fullWidth
                        disabled={!canSave}
                    >
                        {t("save")}
                    </Button>
                    <Button variant="secondary" fullWidth onClick={onClose}>
                        {t("cancel")}
                    </Button>
                </ButtonRow>
            </FormRoot>
        </AuthDialog>
    );
}

const FormRoot = styled("form")(authDialogContentLayout);

const InfoLink = styled("a")({
    width: "20px",
    height: "20px",
    flex: "0 0 20px",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: "4px",
    color: "var(--photos-auth-text-faint)",
    "&:hover": { color: "var(--photos-auth-text-muted)" },
    "&:focus-visible": authFocusRing,
});

const StatusPill = styled("div")({
    ...authBodyTypography,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 14px",
    borderRadius: "20px",
    backgroundColor: "var(--photos-auth-button-secondary)",
    boxShadow: "inset 0 0 0 1px var(--photos-auth-stroke)",
    color: "var(--photos-auth-text-muted)",
    "& > svg, & > .MuiCircularProgress-root": { flexShrink: 0 },
});

const ButtonRow = styled("div")({ display: "flex", gap: "12px" });
