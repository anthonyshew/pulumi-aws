import { render, screen } from "@testing-library/react";
import Home from "../pages/index";

describe("Home", () => {
  it("renders a heading", () => {
    render(<Home users={[]} />);

    const heading = screen.getByText("Welcome to the test image!");

    expect(heading).toBeInTheDocument();
  });
});
