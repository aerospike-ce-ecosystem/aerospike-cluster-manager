import { beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { RecordDetailPage } from "../record-detail-page";
import type { AerospikeRecord } from "@/lib/api/types";

const { routerPush, getRecord, putRecord, deleteRecord } = vi.hoisted(() => ({
  routerPush: vi.fn(),
  getRecord: vi.fn(),
  putRecord: vi.fn(),
  deleteRecord: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: routerPush,
    replace: vi.fn(),
    back: vi.fn(),
    prefetch: vi.fn(),
    refresh: vi.fn(),
  }),
}));

vi.mock("@/lib/api/client", () => ({
  api: {
    getRecord,
    putRecord,
    deleteRecord,
  },
}));

const record: AerospikeRecord = {
  key: {
    namespace: "test",
    set: "demo",
    pk: "record-1",
    digest: "digest-1",
  },
  meta: {
    generation: 3,
    ttl: 120,
  },
  bins: {
    name: "Alice",
    age: 30,
  },
};

describe("RecordDetailPage", () => {
  beforeAll(() => {
    HTMLDialogElement.prototype.showModal = vi.fn(function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    });
    HTMLDialogElement.prototype.close = vi.fn(function (this: HTMLDialogElement) {
      this.removeAttribute("open");
    });
  });

  beforeEach(() => {
    routerPush.mockReset();
    getRecord.mockReset();
    putRecord.mockReset();
    deleteRecord.mockReset();
  });

  it("fetches and renders record detail in view mode", async () => {
    getRecord.mockResolvedValue(record);

    render(<RecordDetailPage connId="conn-1" namespace="test" setName="demo" pk="record-1" />);

    await waitFor(() =>
      expect(getRecord).toHaveBeenCalledWith("conn-1", "test", "demo", "record-1"),
    );
    expect(await screen.findByRole("heading", { name: "Record Detail" })).toBeInTheDocument();
    expect(screen.getAllByText("record-1").length).toBeGreaterThan(0);
    expect(screen.getByText("Bins")).toBeInTheDocument();
  });

  it("starts in edit mode when intent is edit", async () => {
    getRecord.mockResolvedValue(record);

    render(
      <RecordDetailPage
        connId="conn-1"
        namespace="test"
        setName="demo"
        pk="record-1"
        initialIntent="edit"
      />,
    );

    expect(await screen.findByRole("heading", { name: "Edit Record" })).toBeInTheDocument();
    await waitFor(() => expect(getRecord).toHaveBeenCalled());
    expect(screen.getByPlaceholderText("Record key")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("renders create mode without fetching", async () => {
    render(<RecordDetailPage connId="conn-1" namespace="test" setName="demo" createMode />);

    expect(await screen.findByRole("heading", { name: "New Record" })).toBeInTheDocument();
    expect(getRecord).not.toHaveBeenCalled();
    expect(screen.getByPlaceholderText("Record key")).toBeEnabled();
  });

  it("confirms before leaving dirty edit mode and returns via router", async () => {
    const user = userEvent.setup();

    render(
      <RecordDetailPage
        connId="conn-1"
        namespace="test"
        setName="demo"
        createMode
        returnTo="/browser/conn-1/test/demo?page=2&pageSize=50"
      />,
    );

    await user.type(screen.getByPlaceholderText("Record key"), "new-record");
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(await screen.findByText("Discard Changes")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Discard" }));

    expect(routerPush).toHaveBeenCalledWith("/browser/conn-1/test/demo?page=2&pageSize=50");
  });
});
