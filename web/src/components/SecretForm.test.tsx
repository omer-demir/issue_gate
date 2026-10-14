import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { SecretForm } from "./SecretForm";

describe("SecretForm", () => {
  it("requires a title before submitting", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<SecretForm submitLabel="Save" onSubmit={onSubmit} />);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Title is required");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submits the entered secret data", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<SecretForm submitLabel="Save" onSubmit={onSubmit} />);

    await user.type(screen.getByLabelText("Title"), "Email account");
    await user.type(screen.getByLabelText("Username"), "alice@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Email account", username: "alice@example.com" })
    );
  });

  it("shows a delete action only when onDelete is provided, requires confirmation, and calls it once confirmed", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<SecretForm submitLabel="Save" onSubmit={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByRole("alertdialog")).toHaveTextContent("Delete this secret?");

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("does not call onDelete when the confirmation is cancelled", async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<SecretForm submitLabel="Save" onSubmit={vi.fn()} onDelete={onDelete} />);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
  });
});
