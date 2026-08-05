import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import {
    Dialog,
    DialogActions,
    DialogContent,
    DialogTitle,
    IconButton,
    InputAdornment,
    Link,
    TextField,
    type ModalProps,
} from "@mui/material";
import { FocusVisibleButton } from "ente-base/components/mui/FocusVisibleButton";
import { useIsSmallWidth } from "ente-base/components/utils/hooks";
import { ensureOk } from "ente-base/http";
import { getKVS, removeKV, setKV } from "ente-base/kv";
import log from "ente-base/log";
import { useFormik } from "formik";
import { t } from "i18next";
import React, { useEffect, useState } from "react";
import { z } from "zod";
import { SlideUpTransition } from "./mui/SlideUpTransition";

interface DevSettingsProps {
    open: boolean;
    onClose: () => void;
}

export const DevSettings: React.FC<DevSettingsProps> = ({ open, onClose }) => {
    const fullScreen = useIsSmallWidth();

    const handleDialogClose: ModalProps["onClose"] = (_, reason: string) => {
        if (reason != "backdropClick") onClose();
    };

    return (
        <Dialog
            {...{ open, fullScreen }}
            onClose={handleDialogClose}
            slots={{ transition: SlideUpTransition }}
            maxWidth="xs"
            fullWidth
        >
            <Contents {...{ onClose }} />
        </Dialog>
    );
};

type ContentsProps = Pick<DevSettingsProps, "onClose">;

const Contents: React.FC<ContentsProps> = (props) => {
    // This boundary reloads the stored origin on every dialog open.
    // Form stays separate because Formik cannot await initial values.
    const [initialAPIOrigin, setInitialAPIOrigin] = useState<
        string | undefined
    >();

    useEffect(
        () =>
            void getKVS("apiOrigin").then((o) => setInitialAPIOrigin(o ?? "")),
        [],
    );

    if (initialAPIOrigin === undefined) return <></>;

    return <Form {...{ initialAPIOrigin }} {...props} />;
};

type FormProps = ContentsProps & { initialAPIOrigin: string };

const Form: React.FC<FormProps> = ({ initialAPIOrigin, onClose }) => {
    const formik = useFormik({
        initialValues: { apiOrigin: initialAPIOrigin },
        validate: ({ apiOrigin }) => {
            try {
                // Constructing the URL performs validation.
                // eslint-disable-next-line @typescript-eslint/no-unused-expressions
                apiOrigin && new URL(apiOrigin);
            } catch {
                return { apiOrigin: "Invalid endpoint" };
            }
            return {};
        },
        onSubmit: async (values, { setSubmitting, setErrors }) => {
            try {
                await updateAPIOrigin(values.apiOrigin);
            } catch (e) {
                setErrors({
                    apiOrigin: e instanceof Error ? e.message : String(e),
                });
                return;
            }

            setSubmitting(false);
            onClose();
        },
    });

    // Auto-focus marks this field touched before submission.
    const hasError =
        formik.submitCount > 0 &&
        formik.touched.apiOrigin &&
        !!formik.errors.apiOrigin;

    return (
        <form onSubmit={formik.handleSubmit}>
            <DialogTitle sx={{ "&&": { padding: "24px 24px 12px 24px" } }}>
                {t("developer_settings")}
            </DialogTitle>
            <DialogContent sx={{ "&&": { padding: "0 24px 0 24px" } }}>
                <TextField
                    fullWidth
                    autoFocus
                    name="apiOrigin"
                    label={t("server_endpoint")}
                    placeholder="http://localhost:8080"
                    value={formik.values.apiOrigin}
                    onChange={formik.handleChange}
                    onBlur={formik.handleBlur}
                    error={hasError}
                    helperText={hasError ? formik.errors.apiOrigin : " "}
                    slotProps={{
                        input: {
                            endAdornment: (
                                <InputAdornment position="end">
                                    <Link
                                        href="https://ente.com/help/self-hosting/installation/post-install/#step-6-configure-apps-to-use-your-server"
                                        target="_blank"
                                        rel="noopener"
                                    >
                                        <IconButton
                                            aria-label={t("more_information")}
                                            color="secondary"
                                            edge="end"
                                        >
                                            <InfoOutlinedIcon />
                                        </IconButton>
                                    </Link>
                                </InputAdornment>
                            ),
                        },
                    }}
                />
            </DialogContent>
            <DialogActions sx={{ "&&": { padding: "0 24px 24px 24px" } }}>
                <FocusVisibleButton
                    type="submit"
                    color="accent"
                    fullWidth
                    disabled={formik.isSubmitting}
                >
                    {t("save")}
                </FocusVisibleButton>
                <FocusVisibleButton
                    onClick={onClose}
                    color="secondary"
                    fullWidth
                >
                    {t("cancel")}
                </FocusVisibleButton>
            </DialogActions>
        </form>
    );
};

const updateAPIOrigin = async (origin: string) => {
    if (!origin) {
        await removeKV("apiOrigin");
        return;
    }

    const res = await fetch(`${origin}/ping`);
    ensureOk(res);
    try {
        PingResponse.parse(await res.json());
    } catch (e) {
        log.error("Invalid response", e);
        throw new Error("Invalid response", { cause: e });
    }

    await setKV("apiOrigin", origin);
};

const PingResponse = z.object({ message: z.enum(["pong"]) });
