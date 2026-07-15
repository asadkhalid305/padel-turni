import type { Database } from "@/types/database";

export type AppUserRole =
  Database["public"]["Tables"]["app_users"]["Row"]["role"];
export type WorkspaceRole =
  Database["public"]["Tables"]["workspace_memberships"]["Row"]["role"];

export function isAdminRole(role: AppUserRole) {
  return role === "admin" || role === "super_admin";
}

export function isSuperAdminRole(role: AppUserRole) {
  return role === "super_admin";
}

export function workspaceRoleLabel(role: WorkspaceRole) {
  if (role === "owner") return "Owner";
  if (role === "admin") return "Admin";
  return "Member";
}

export function isWorkspaceAdminRole(role: WorkspaceRole | null) {
  return role === "owner" || role === "admin";
}
