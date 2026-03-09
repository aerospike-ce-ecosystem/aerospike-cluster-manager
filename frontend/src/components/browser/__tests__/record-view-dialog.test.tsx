import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { RecordViewDialog, RecordViewSheet } from "../record-view-dialog";
import type { AerospikeRecord } from "@/lib/api/types";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = vi.fn();
  HTMLDialogElement.prototype.close = vi.fn();
});

const record: AerospikeRecord = {
  key: {
    namespace: "test",
    set: "demo",
    pk: "record-1",
    digest: "digest-1",
  },
  meta: {
    generation: 3,
    ttl: 60,
    lastUpdateMs: 1_700_000_000_000,
  },
  bins: {
    name: "Alice",
    age: 30,
  },
};

describe("Record detail surfaces", () => {
  it("renders record detail dialog content", () => {
    render(<RecordViewDialog record={record} onClose={vi.fn()} />);
    expect(screen.getAllByText("Record Detail")[0]).toBeInTheDocument();
    expect(screen.getAllByText("record-1").length).toBeGreaterThan(0);
    expect(screen.getByText("generation")).toBeInTheDocument();
  });

  it("renders record detail sheet content", () => {
    render(<RecordViewSheet record={record} onClose={vi.fn()} />);
    expect(screen.getByTestId("record-view-sheet")).toBeInTheDocument();
    expect(screen.getByText("Bins")).toBeInTheDocument();
    expect(screen.getAllByText("record-1").length).toBeGreaterThan(0);
  });
});
