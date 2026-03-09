"use client";

import { Loader2 } from "lucide-react";
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
import { CheckboxGroup } from "@/components/common/checkbox-group";
import type { AerospikeRole } from "@/lib/api/types";

const AVAILABLE_PRIVILEGES = [
  "read",
  "write",
  "read-write",
  "read-write-udf",
  "sys-admin",
  "user-admin",
  "data-admin",
];

interface CreateUserDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  username: string;
  onUsernameChange: (val: string) => void;
  password: string;
  onPasswordChange: (val: string) => void;
  selectedRoles: string[];
  onToggleRole: (role: string) => void;
  roles: AerospikeRole[];
  creating: boolean;
  onSubmit: () => void;
}

export function CreateUserDialog({
  open,
  onOpenChange,
  username,
  onUsernameChange,
  password,
  onPasswordChange,
  selectedRoles,
  onToggleRole,
  roles,
  creating,
  onSubmit,
}: CreateUserDialogProps) {
  const roleItems =
    roles.length > 0
      ? roles.map((r) => ({ id: r.name, label: r.name }))
      : AVAILABLE_PRIVILEGES.map((p) => ({ id: p, label: p }));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Create User</DialogTitle>
          <DialogDescription>Create a new Aerospike user with roles.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Username</Label>
            <Input
              placeholder="username"
              autoComplete="off"
              value={username}
              onChange={(e) => onUsernameChange(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Password</Label>
            <Input
              type="password"
              placeholder="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => onPasswordChange(e.target.value)}
            />
          </div>
          <div className="grid gap-2">
            <Label>Roles</Label>
            <CheckboxGroup
              items={roleItems}
              selected={selectedRoles}
              onToggle={onToggleRole}
              idPrefix="urole"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={onSubmit} disabled={creating || !username.trim() || !password.trim()}>
            {creating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
