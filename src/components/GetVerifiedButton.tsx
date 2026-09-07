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
        className={`flex w-full items-center gap-4 rounded-3xl border border-emerald-200 bg-emerald-50 p-5 text-left shadow-sm transition hover:bg-emerald-100/70 active:scale-[0.99] ${className}`}
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-500 text-white shadow-sm">
          <ShieldCheck size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-base font-bold text-emerald-900">Get verified</p>
          <p className="truncate text-sm text-emerald-700/80">
            Want to host? A few quick steps unlock it.
          </p>
        </div>
        <ArrowRight size={20} className="shrink-0 text-emerald-600" />
      </button>

      <Drawer
        open={open}
        onClose={() => setOpen(false)}
        placement="bottom"
        height="90vh"
        title="Get verified"
        styles={{ body: { padding: 0, display: "flex", flexDirection: "column", minHeight: 0 } }}
        className="[&_.ant-drawer-content]:rounded-t-3xl"
      >
        <GetVerifiedChecklist />
      </Drawer>
    </>
  );
}
