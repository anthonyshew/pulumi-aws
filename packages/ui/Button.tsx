import * as React from "react";

export const Button = ({
  onClick,
  children,
}: {
  onClick?: any;
  children?: React.ReactNode;
}) => {
  return <button onClick={onClick}>{children ?? "Buttony Button"}</button>;
};
