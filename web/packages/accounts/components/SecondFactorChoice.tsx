import type { ModalProps } from "@mui/material";
import type { ModalVisibilityProps } from "ente-base/components/utils/modal";
import React, { type ComponentType } from "react";

export type SecondFactorType = "totp" | "passkey";

export interface SecondFactorChoicePresentationProps {
    open: boolean;
    onDialogClose: ModalProps["onClose"];
    onSelect: (factor: SecondFactorType) => void;
}

type SecondFactorChoiceProps = ModalVisibilityProps & {
    onSelect: (factor: SecondFactorType) => void;
    presentation: ComponentType<SecondFactorChoicePresentationProps>;
};

export const SecondFactorChoice: React.FC<SecondFactorChoiceProps> = ({
    open,
    onClose,
    onSelect,
    presentation: Presentation,
}) => {
    const handleDialogClose: ModalProps["onClose"] = (_, reason) => {
        if (reason != "backdropClick") onClose();
    };

    const handleSelect = (factor: SecondFactorType) => {
        onClose();
        onSelect(factor);
    };

    return (
        <Presentation
            open={open}
            onDialogClose={handleDialogClose}
            onSelect={handleSelect}
        />
    );
};
