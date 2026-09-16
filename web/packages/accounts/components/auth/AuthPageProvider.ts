import {
    createContext,
    useContext,
    type ComponentType,
    type PropsWithChildren,
} from "react";
import type { VerifyingPasskeyPresentationProps } from "../LoginComponents";
import type { AuthPageShellProps } from "./AuthPageShell";

export interface AuthLoginFrameProps extends PropsWithChildren {
    onHostChanged: () => void;
}

// App defaults for shared account pages, not reusable forms or dialogs.
export interface AuthPageConfig {
    LoginFrame?: ComponentType<AuthLoginFrameProps>;
    keepLoginLoadingOnRedirect?: boolean;
    recoveryKeyCloseDestination?: string;
    encryptWithRecoveryKey?: (
        data: string,
    ) => Promise<{ encryptedData: string; nonce: string }>;
    passkeyPresentation?: ComponentType<VerifyingPasskeyPresentationProps>;
    Shell?: ComponentType<
        Pick<AuthPageShellProps, "children" | "contentWidth">
    >;
}

const AuthPageContext = createContext<AuthPageConfig>({});

export const AuthPageProvider = AuthPageContext.Provider;

export const useAuthPageConfig = (): AuthPageConfig =>
    useContext(AuthPageContext);
