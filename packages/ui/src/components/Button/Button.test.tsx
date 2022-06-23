import "@testing-library/jest-dom";
import { expect } from "vitest";
import { render, screen } from "../../utils/test-utils";
import { Button } from "./";

describe("Button", async () => {
  it("should render the input", () => {
    render(<Button>Test me</Button>);
    expect(screen.getByText("Test me")).toBeInTheDocument();
  });
});
