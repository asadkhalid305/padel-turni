"use client";

import {
  Building2,
  CalendarDays,
  Check,
  ChevronDown,
  CircleGauge,
  History,
  LogOut,
  Plus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { use } from "react";
import type { ReactNode } from "react";

import { signOut, switchActiveWorkspace } from "@/app/actions";
import { BrandLogo } from "@/components/brand-logo";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { isWorkspaceAdminRole, workspaceRoleLabel } from "@/lib/roles";
import { cn } from "@/lib/utils";
import type { AuthenticatedAppUser } from "@/lib/supabase/server";

const navigation = [
  { href: "/", label: "Dashboard", icon: CircleGauge },
  { href: "/players", label: "Players", icon: Users },
  { href: "/events", label: "Events", icon: CalendarDays },
  { href: "/history", label: "History", icon: History },
];
const publicShelllessPaths = [
  "/login",
  "/invites/",
  "/support",
  "/contact",
  "/privacy",
  "/imprint",
  "/terms",
];

export function AppShell({
  children,
  userPromise,
  activePlayerCountPromise,
}: {
  children: ReactNode;
  userPromise: Promise<AuthenticatedAppUser | null>;
  activePlayerCountPromise: Promise<number>;
}) {
  const pathname = usePathname();

  if (
    publicShelllessPaths.some((path) =>
      path.endsWith("/")
        ? pathname.startsWith(path)
        : pathname === path || pathname.startsWith(`${path}/`),
    )
  ) {
    return children;
  }

  const user = use(userPromise);
  if (pathname === "/" && !user) {
    return children;
  }

  const isAdmin = user ? isWorkspaceAdminRole(user.activeWorkspaceRole) : false;
  const workspaceOptions = user?.workspaces ?? [];
  const activeWorkspace = workspaceOptions.find(
    (workspace) => workspace.workspaceId === user?.activeWorkspaceId,
  );
  const activePlayerCount = use(activePlayerCountPromise);
  const canCreateEvent = activePlayerCount >= 4;

  return (
    <div
      className="h-dvh overflow-hidden lg:grid lg:grid-cols-[280px_1fr] xl:grid-cols-[300px_1fr]"
      data-padeltour-app-shell
    >
      <aside className="hidden min-h-0 overflow-y-auto border-r border-white/10 bg-[var(--ink)] p-5 text-white lg:flex lg:flex-col">
        <Link href="/" className="px-2 py-4" aria-label="Padel Tourni home">
          <BrandLogo tagline />
        </Link>
        <nav className="mt-8 space-y-2">
          {navigation.map((item) => {
            const active =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition",
                  active
                    ? "bg-white text-[var(--ink)]"
                    : "text-white/65 hover:bg-white/10 hover:text-white",
                )}
              >
                <item.icon size={19} />
                {item.label}
              </Link>
            );
          })}
        </nav>
        {isAdmin ? (
          <CreateEventShortcut canCreateEvent={canCreateEvent} sidebar />
        ) : null}
        <div className="mt-auto space-y-3">
          {user && workspaceOptions.length > 1 ? (
            <WorkspaceSwitcher
              activeWorkspaceId={user.activeWorkspaceId}
              activeWorkspaceName={activeWorkspace?.name}
              nextPath={pathname}
              workspaces={workspaceOptions}
              sidebar
            />
          ) : null}
          <form action={signOut}>
            <PendingSubmitButton
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-transparent px-3 text-sm font-bold text-white/75 transition hover:bg-white/10 hover:text-white"
              variant="ghost"
              pendingLabel="Signing out..."
            >
              <LogOut size={17} />
              Sign out
            </PendingSubmitButton>
          </form>
        </div>
      </aside>

      <main className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
        <header className="shrink-0 border-b border-emerald-950/5 bg-white/55 px-5 py-4 backdrop-blur lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <Link href="/" className="lg:hidden" aria-label="Padel Tourni home">
              <BrandLogo markClassName="size-9" />
            </Link>
            <div className="flex min-w-0 items-center gap-2">
              {user && workspaceOptions.length > 1 ? (
                <div className="lg:hidden">
                  <WorkspaceSwitcher
                    activeWorkspaceId={user.activeWorkspaceId}
                    activeWorkspaceName={activeWorkspace?.name}
                    nextPath={pathname}
                    workspaces={workspaceOptions}
                  />
                </div>
              ) : null}
              <form action={signOut} className="lg:hidden">
                <PendingSubmitButton
                  className="grid size-10 place-items-center rounded-xl border border-emerald-950/10 bg-white text-[var(--ink)]"
                  aria-label="Sign out"
                  variant="ghost"
                  pendingLabel={<span className="sr-only">Signing out...</span>}
                >
                  <LogOut size={17} />
                </PendingSubmitButton>
              </form>
            </div>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <div className="mx-auto max-w-[1500px] p-5 pb-28 sm:p-7 sm:pb-28 lg:p-9 lg:pb-9">
            {children}
          </div>
        </div>
      </main>

      <nav className="fixed inset-x-3 bottom-3 z-50 grid grid-cols-4 rounded-2xl border border-white/70 bg-[var(--ink)] p-1.5 text-white shadow-2xl lg:hidden">
        {navigation.map((item) => {
          const active =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[10px] font-bold",
                active ? "bg-white text-[var(--ink)]" : "text-white/60",
              )}
            >
              <item.icon size={19} />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function WorkspaceSwitcher({
  activeWorkspaceId,
  activeWorkspaceName,
  nextPath,
  workspaces,
  sidebar = false,
}: {
  activeWorkspaceId: string | null;
  activeWorkspaceName?: string;
  nextPath: string;
  workspaces: NonNullable<AuthenticatedAppUser["workspaces"]>;
  sidebar?: boolean;
}) {
  return (
    <details
      className={cn(
        "group relative",
        sidebar
          ? "text-white"
          : "min-w-0 max-w-[62vw] text-[var(--ink)] sm:max-w-none",
      )}
    >
      <summary
        className={cn(
          "flex min-h-12 cursor-pointer list-none items-center gap-3 rounded-xl border text-left transition marker:hidden [&::-webkit-details-marker]:hidden",
          sidebar
            ? "border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
            : "border-emerald-950/10 bg-white px-3 py-2 shadow-sm hover:border-emerald-950/20",
        )}
      >
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--lime)]/90 text-[var(--ink)]">
          <Building2 size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span
            className={cn(
              "block truncate text-sm font-black",
              sidebar ? "text-white" : "text-[var(--ink)]",
            )}
          >
            {activeWorkspaceName ?? "Club"}
          </span>
          <span
            className={cn(
              "mt-0.5 block text-[11px] font-bold uppercase tracking-[0.12em]",
              sidebar ? "text-white/45" : "text-slate-400",
            )}
          >
            Club
          </span>
        </span>
        <ChevronDown
          size={17}
          className={cn(
            "shrink-0 transition group-open:rotate-180",
            sidebar ? "text-white/55" : "text-slate-500",
          )}
        />
      </summary>
      <div
        className={cn(
          "absolute z-50 overflow-hidden rounded-2xl border p-1.5 shadow-2xl",
          sidebar
            ? "inset-x-0 bottom-full mb-2 border-white/10 bg-[#0f2f26]"
            : "right-0 top-full mt-2 w-[min(20rem,calc(100vw-2rem))] border-emerald-950/10 bg-white",
        )}
      >
        <div
          className={cn(
            "px-3 pb-2 pt-2 text-[11px] font-black uppercase tracking-[0.16em]",
            sidebar ? "text-white/45" : "text-slate-400",
          )}
        >
          Switch club
        </div>
        <div className="space-y-1">
          {workspaces.map((workspace) => {
            const active = workspace.workspaceId === activeWorkspaceId;
            return active ? (
              <div
                key={workspace.workspaceId}
                className={cn(
                  "min-h-12 rounded-xl px-3 py-2",
                  sidebar ? "bg-white/10 text-white" : "bg-emerald-50",
                )}
              >
                <WorkspaceMenuRow
                  active
                  workspace={workspace}
                  sidebar={sidebar}
                />
              </div>
            ) : (
              <form key={workspace.workspaceId} action={switchActiveWorkspace}>
                <input type="hidden" name="nextPath" value={nextPath} />
                <input
                  type="hidden"
                  name="workspaceId"
                  value={workspace.workspaceId}
                />
                <PendingSubmitButton
                  className={cn(
                    "min-h-12 w-full justify-start rounded-xl px-3 py-2 text-left transition",
                    sidebar
                      ? "bg-transparent text-white hover:bg-white/10"
                      : "bg-transparent text-[var(--ink)] hover:bg-emerald-50",
                  )}
                  variant="ghost"
                  pendingLabel="Switching..."
                >
                  <WorkspaceMenuRow workspace={workspace} sidebar={sidebar} />
                </PendingSubmitButton>
              </form>
            );
          })}
        </div>
      </div>
    </details>
  );
}

function WorkspaceMenuRow({
  active = false,
  workspace,
  sidebar = false,
}: {
  active?: boolean;
  workspace: NonNullable<AuthenticatedAppUser["workspaces"]>[number];
  sidebar?: boolean;
}) {
  return (
    <span className="grid w-full min-w-0 flex-1 grid-cols-[1rem_minmax(0,1fr)_auto] items-center gap-2">
      {active ? (
        <Check
          size={16}
          className={sidebar ? "text-[var(--lime)]" : "text-[var(--green)]"}
        />
      ) : (
        <span aria-hidden="true" />
      )}
      <span
        className={cn(
          "truncate text-sm font-black",
          sidebar ? "text-white" : "text-[var(--ink)]",
        )}
      >
        {workspace.name}
      </span>
      <span
        className={cn(
          "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.08em]",
          sidebar
            ? "bg-white/10 text-[var(--lime)]"
            : "bg-emerald-100 text-emerald-800",
        )}
      >
        {workspaceRoleLabel(workspace.role)}
      </span>
    </span>
  );
}

function CreateEventShortcut({
  canCreateEvent,
  sidebar = false,
}: {
  canCreateEvent: boolean;
  sidebar?: boolean;
}) {
  const label = "Create event";

  if (!canCreateEvent) {
    return (
      <span
        aria-disabled="true"
        title="Add at least four active players before creating an event."
        className={cn(
          "inline-flex cursor-not-allowed items-center justify-center gap-2 rounded-xl bg-slate-200 px-4 text-sm font-black text-slate-500",
          sidebar ? "mt-6 min-h-12" : "min-h-10 py-2.5",
        )}
      >
        {sidebar ? <Plus size={18} /> : null}
        {label}
      </span>
    );
  }

  return (
    <Link
      href="/events/new"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-xl text-sm font-black transition",
        sidebar
          ? "mt-6 min-h-12 bg-[var(--lime)] px-4 text-[var(--ink)] hover:bg-[#c9f66d]"
          : "min-h-10 bg-[var(--ink)] px-4 py-2.5 text-white",
      )}
    >
      {sidebar ? <Plus size={18} /> : null}
      {label}
    </Link>
  );
}
