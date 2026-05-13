import "@fontsource-variable/inter";
import { CssBaseline } from "@mui/material";
import { ThemeProvider } from "@mui/material/styles";
import { CustomHead } from "ente-base/components/Head";
import { useSetupLogs } from "ente-base/components/utils/hooks-app";
import { shareTheme } from "ente-base/components/utils/theme";
import type { AppProps } from "next/app";
import "photoswipe/dist/photoswipe.css";
import React from "react";
import { SocialAppStateProvider } from "state/SocialAppStateProvider";
import "styles/globals.css";

const App: React.FC<AppProps> = ({ Component, pageProps }) => {
    useSetupLogs({ disableDiskLogs: true });

    return (
        <ThemeProvider
            theme={shareTheme}
            defaultMode="light"
            storageManager={null}
        >
            <CustomHead title="Ente" />
            <CssBaseline enableColorScheme />
            <SocialAppStateProvider>
                <Component {...pageProps} />
            </SocialAppStateProvider>
        </ThemeProvider>
    );
};

export default App;
