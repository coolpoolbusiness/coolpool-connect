import { useState } from "react";
import { Drawer } from "antd";
import { ShieldCheck, ArrowRight } from "lucide-react";
import { GetVerifiedChecklist } from "@/components/GetVerifiedChecklist";

/**
 * Compact "Get verified" launcher for the passenger side. Shows a single,
 * unobtrusive button (so it doesn't clutter a traveller's trips page with the
 * full host-verification flow); tapping it opens the verification wizard in a
 * bottom sheet.
 */
export function GetVerifiedButton({ className = "" }: { className?: string }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`flex w-full items-center gap-3 rounded-3xl border border-primary/15 bg-primary/5 p-4 text-left transition hover:bg-primary/10 active:scale-[0.99] ${className}`}
      >
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-white shadow-glow">
          <ShieldCheck size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-bold text-gray-900">Get verified</p>
          <p className="truncate text-sm text-muted-foreground">
            Want to host? A few quick steps unlock it.
          </p>
        </div>
        <ArrowRight size={20} className="shrink-0 text-primary" />
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        height="90vh"
        title="Get verified"
        styles={{ body: { padding: "16px 16px 32px" } }}
        className="[&_.ant-drawer-content]:rounded-t-3xl"
      >
        <GetVerifiedChecklist />
      </Drawer>
    </>
  );
}
