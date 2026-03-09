"use client";

import { Loader2, Wifi, WifiOff, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

const PRESET_COLORS = ["#0097D3", "#c4373a", "#22c55e", "#f59e0b", "#8b5cf6", "#ec4899"];

export interface ConnectionFormData {
  name: string;
  hosts: string;
  port: string;
  username: string;
  password: string;
  color: string;
}

export const emptyForm: ConnectionFormData = {
  name: "",
  hosts: "127.0.0.1",
  port: "3000",
  username: "",
  password: "",
  color: PRESET_COLORS[0],
};

interface ConnectionFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingId: string | null;
  form: ConnectionFormData;
  onFormChange: (form: ConnectionFormData) => void;
  onSave: () => Promise<void>;
  onTest: () => Promise<void>;
  saving: boolean;
  testing: boolean;
  testResult: { success: boolean; message: string } | null;
}

export function ConnectionFormDialog({
  open,
  onOpenChange,
  editingId,
  form,
  onFormChange,
  onSave,
  onTest,
  saving,
  testing,
  testResult,
}: ConnectionFormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{editingId ? "Edit Cluster" : "New Cluster"}</DialogTitle>
          <DialogDescription>
            {editingId
              ? "Update the cluster connection settings."
              : "Create a new Aerospike cluster connection."}
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label htmlFor="conn-name">Name</Label>
            <Input
              id="conn-name"
              placeholder="My Cluster"
              value={form.name}
              onChange={(e) => onFormChange({ ...form, name: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="conn-hosts">Hosts (comma-separated)</Label>
            <Input
              id="conn-hosts"
              placeholder="127.0.0.1, 10.0.0.2"
              value={form.hosts}
              onChange={(e) => onFormChange({ ...form, hosts: e.target.value })}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="conn-port">Port</Label>
            <Input
              id="conn-port"
              type="number"
              placeholder="3000"
              value={form.port}
              onChange={(e) => onFormChange({ ...form, port: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label htmlFor="conn-user">Username</Label>
              <Input
                id="conn-user"
                placeholder="Optional"
                value={form.username}
                onChange={(e) => onFormChange({ ...form, username: e.target.value })}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="conn-pass">Password</Label>
              <Input
                id="conn-pass"
                type="password"
                placeholder={editingId ? "••••••••" : "Optional"}
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => onFormChange({ ...form, password: e.target.value })}
              />
            </div>
          </div>

          <div className="grid gap-2">
            <Label>Color</Label>
            <div className="flex gap-2">
              {PRESET_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  aria-label={`Select ${color} color`}
                  className={cn(
                    "h-8 w-8 rounded-full transition-all duration-150",
                    form.color === color
                      ? "ring-offset-background scale-110 ring-2 ring-offset-2"
                      : "opacity-70 hover:scale-110 hover:opacity-100",
                  )}
                  style={{
                    backgroundColor: color,
                    boxShadow:
                      form.color === color
                        ? `0 0 0 2px var(--color-background), 0 0 0 4px ${color}`
                        : undefined,
                  }}
                  onClick={() => onFormChange({ ...form, color })}
                />
              ))}
            </div>
          </div>

          {testResult && (
            <div
              className={cn(
                "animate-scale-in flex items-center gap-2 rounded-lg border px-3 py-2.5 text-sm",
                testResult.success
                  ? "border-success/20 bg-success/5 text-success"
                  : "border-destructive/20 bg-destructive/5 text-destructive",
              )}
            >
              {testResult.success ? (
                <Check className="h-4 w-4 shrink-0" />
              ) : (
                <WifiOff className="h-4 w-4 shrink-0" />
              )}
              {testResult.message}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          {editingId && (
            <Button
              type="button"
              variant="outline"
              onClick={onTest}
              disabled={testing}
              className="mr-auto"
            >
              {testing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Wifi className="mr-2 h-4 w-4" />
              )}
              Test Cluster
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={onSave} disabled={saving || !form.name.trim() || !form.hosts.trim()}>
            {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingId ? "Update" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
