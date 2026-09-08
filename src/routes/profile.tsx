import { useState, type ReactNode } from "react";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Drawer } from "antd";
import {
  ShieldCheck,
  Ticket,
  MessageCircle,
  LayoutDashboard,
  Wallet,
  HelpCircle,
  LogOut,
  ChevronRight,
  CheckCircle2,
  ArrowRight,
} from "lucide-react";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { getUserDisplayName, getUserInitial, formatRoleLabel } from "@/lib/user-display";
import {
  getMyMemberVerification,
  getBankAccount,
  getVehicleByDriverUserId,
} from "@/data/appwrite-repository";
import { GetVerifiedChecklist } from "@/components/GetVerifiedChecklist";

export const Route = createFileRoute("/profile")({
  component: ProfilePage,
});

function ActionRow({
  icon,
  label,
  to,
  onClick,
  danger,
}: {
  icon: ReactNode;
  label: string;
  to?: string;
  onClick?: () => void;
  danger?: boolean;
}) {
  const inner = (
    <div
      className={`flex items-center gap-3 rounded-2xl px-4 py-3.5 transition active:scale-[0.99] ${
        danger ? "text-destructive hover:bg-destructive/5" : "text-gray-800 hover:bg-gray-50"
      }`}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
          danger ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
        }`}
      >
        {icon}
      </span>
      <span className="flex-1 font-semibold">{label}</span>
      {!danger && <ChevronRight size={18} className="text-gray-300" />}
    </div>
  );
  if (to) {
    return (
      <Link to={to as never} className="block">
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {inner}
    </button>
  );
}

function ProfilePage() {
  const { user, roles = [], isDriver, isAdmin, signOut, authLoading } = useAuth();
  const navigate = useNavigate();
  const [verifyOpen, setVerifyOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const { data: selfie } = useQuery({
    queryKey: ["my-verification", user?.$id],
    queryFn: () => (user ? getMyMemberVerification(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });
  const { data: bank } = useQuery({
    queryKey: ["bank-account", user?.$id],
    queryFn: () => (user ? getBankAccount(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });
  const { data: vehicle } = useQuery({
    queryKey: ["my-vehicle", user?.$id],
    queryFn: () => (user ? getVehicleByDriverUserId(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });

  if (!user && !authLoading) {
    return (
      <div className="flex min-h-screen flex-col bg-slate-50/50">
        <SiteHeader />
        <main className="container mx-auto flex-1 px-4 pb-10 pt-28 sm:pt-32">
          <div className="mx-auto max-w-md rounded-3xl border border-border/60 bg-white/80 p-10 text-center shadow-card">
            <p className="mb-4 text-base text-muted-foreground">Sign in to see your profile.</p>
            <Button asChild variant="hero" className="rounded-3xl">
              <Link to="/members">Sign in</Link>
            </Button>
          </div>
        </main>
        <SiteFooter />
      </div>
    );
  }
  if (!user) return null;

  const displayName = getUserDisplayName(user);
  const prefs = (user.prefs ?? {}) as Record<string, unknown>;
  const memberCode = typeof prefs.memberCode === "string" ? prefs.memberCode : user.$id;
  const emailMatch = /^u(\d{6,})@phone\.coolpool\.in$/i.exec(user.email ?? "");
  const realEmail = emailMatch ? "" : user.email || "";
  const phone =
    user.phone ||
    (typeof prefs.phone === "string" ? prefs.phone : "") ||
    (emailMatch ? `+91 ${emailMatch[1]}` : "");
  const roleLabel = isAdmin ? "Admin" : isDriver ? "Host" : "Guest";

  const selfieDone = selfie?.status === "approved";
  const identityDone =
    prefs.aadhaarVerified === true || prefs.panVerified === true || prefs.dlVerified === true;
  const carDone = !!vehicle;
  const bankDone = prefs.bankVerified === true || !!bank;
  const doneCount = [selfieDone, identityDone, carDone, bankDone].filter(Boolean).length;
  const allDone = doneCount === 4;

  return (
    <div className="flex min-h-screen flex-col bg-slate-50/50">
      <SiteHeader />
      <main className="container mx-auto max-w-lg flex-1 px-4 pb-10 pt-28 sm:pt-32">
        {/* Header card */}
        <div className="rounded-3xl border border-white/60 bg-white/90 p-6 text-center shadow-card backdrop-blur-md">
          <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-gradient-primary text-3xl font-black text-white shadow-glow">
            {getUserInitial(user)}
          </div>
          <div className="mt-3 flex items-center justify-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{displayName}</h1>
            {allDone && (
              <span className="grid h-6 w-6 place-items-center rounded-full bg-emerald-500 text-white">
                <ShieldCheck size={14} />
              </span>
            )}
          </div>
          <div className="mt-2 flex items-center justify-center gap-2">
            <span className="rounded-full bg-primary/10 px-3.5 py-1 text-sm font-bold text-primary">
              {roleLabel}
            </span>
            {(roles as string[]).includes("admin") && roleLabel !== "Admin" && (
              <span className="rounded-full bg-primary/10 px-3.5 py-1 text-sm font-bold text-primary">
                {formatRoleLabel("admin")}
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => {
              try {
                void navigator.clipboard?.writeText(memberCode);
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1500);
              } catch {
                /* clipboard unavailable */
              }
            }}
            className="mt-2 font-mono text-xs text-muted-foreground underline-offset-2 hover:underline"
            title="Tap to copy your member ID"
          >
            {copied ? "Copied ✓" : memberCode}
          </button>
        </div>

        {/* Verification strip */}
        <div className="mt-4">
          {allDone ? (
            <div className="flex items-center gap-3 rounded-3xl border border-emerald-200 bg-emerald-50 p-4">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white">
                <CheckCircle2 size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-emerald-900">You're verified</p>
                <p className="text-sm text-emerald-700/80">All checks complete.</p>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setVerifyOpen(true)}
              className="flex w-full items-center gap-4 rounded-3xl border border-primary/15 bg-primary/5 p-4 text-left transition hover:bg-primary/10 active:scale-[0.99]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-white shadow-glow">
                <ShieldCheck size={20} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900">Get verified</p>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-gradient-primary transition-all"
                    style={{ width: `${(doneCount / 4) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {doneCount} of 4 done
                </p>
              </div>
              <ArrowRight size={20} className="shrink-0 text-primary" />
            </button>
          )}
        </div>

        {/* Details */}
        <div className="mt-4 rounded-3xl border border-white/60 bg-white/90 p-2 shadow-card backdrop-blur-md">
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Email
            </span>
            <span className="truncate text-right font-semibold">{realEmail || "—"}</span>
          </div>
          <div className="border-t border-gray-100" />
          <div className="flex items-center justify-between gap-4 px-4 py-3">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Phone
            </span>
            <span className="truncate text-right font-semibold">{phone || "—"}</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-4 rounded-3xl border border-white/60 bg-white/90 p-2 shadow-card backdrop-blur-md">
          <ActionRow icon={<Ticket size={18} />} label="My trips" to="/trips" />
          <ActionRow icon={<MessageCircle size={18} />} label="Inbox" to="/inbox" />
          {(isDriver || isAdmin) && (
            <ActionRow
              icon={<LayoutDashboard size={18} />}
              label={isAdmin ? "Admin dashboard" : "Host dashboard"}
              to={isAdmin ? "/admin/dashboard" : "/driver/dashboard"}
            />
          )}
          {isDriver && (
            <ActionRow
              icon={<Wallet size={18} />}
              label="Payouts"
              to="/driver/dashboard"
            />
          )}
          <ActionRow icon={<HelpCircle size={18} />} label="Help & support" to="/contact" />
        </div>

        {/* Sign out */}
        <div className="mt-4 rounded-3xl border border-white/60 bg-white/90 p-2 shadow-card backdrop-blur-md">
          <ActionRow
            icon={<LogOut size={18} />}
            label="Sign out"
            danger
            onClick={async () => {
              await signOut();
              void navigate({ to: "/" });
            }}
          />
        </div>
      </main>
      <SiteFooter />

      <Drawer
        open={verifyOpen}
        onClose={() => setVerifyOpen(false)}
        placement="bottom"
        height="90vh"
        title="Get verified"
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column", minHeight: 0 } }}
        className="[&_.ant-drawer-content]:rounded-t-3xl"
      >
        <GetVerifiedChecklist />
      </Drawer>
    </div>
  );
}
