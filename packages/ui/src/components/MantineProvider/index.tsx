import {
  MantineProvider as MantineLibProvider,
  MantineProviderProps,
} from "@mantine/core";
import React from "react";
import { theme, themeStyles } from "./styles/theme";

export const MantineProvider = ({
  children,
  ...props
}: MantineProviderProps) => {
  return (
    <MantineLibProvider
      withNormalizeCSS
      theme={theme}
      styles={themeStyles}
      {...props}
    >
      {children}
    </MantineLibProvider>
  );
};
