import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Select, Button, message } from "antd";
import { setMemberRoleAsAdmin } from "./adminUserApi";
import { MEMBER_ROLE_OPTIONS, describeMemberCode } from "@/lib/memberCode";

/**
 * Admin control to stamp a role letter (Admin/Host/Guest/Driver/Employee) and
 * gender onto a member's ID — e.g. "AM" for VIP numbers. Keeps the YYMM + serial.
 */
export function MemberCodeEditor({
  userId,
  currentCode,
}: {
  userId: string;
  currentCode?: string | null;
}) {
  const qc = useQueryClient();
  const parsed = /^\d{4}-CP([A-Za-z])([A-Za-z])-\d{3,}$/.exec(String(currentCode ?? ""));
  const [roleChar, setRoleChar] = useState(parsed?.[1]?.toUpperCase() ?? "G");
  const [gender, setGender] = useState(
    parsed?.[2]?.toUpperCase() === "F" ? "female" : "male",
  );
  const [code, setCode] = useState(currentCode ?? "");
  const [saving, setSaving] = useState(false);
  const desc = describeMemberCode(code);

  return (
    <div className="rounded-2xl border border-gray-100 p-3">
      <div className="text-xs text-muted-foreground">Member ID</div>
      <div className="font-mono text-sm">
        {code || "—"}
        {desc && <span className="ml-1 font-sans text-xs text-muted-foreground">· {desc}</span>}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Select
          value={roleChar}
          onChange={setRoleChar}
          size="small"
          style={{ width: 140 }}
          options={MEMBER_ROLE_OPTIONS.map((o) => ({
            value: o.char,
            label: `${o.char} · ${o.label}`,
          }))}
        />
        <Select
          value={gender}
          onChange={setGender}
          size="small"
          style={{ width: 100 }}
          options={[
            { value: "male", label: "Male" },
            { value: "female", label: "Female" },
          ]}
        />
        <Button
          size="small"
          type="primary"
          loading={saving}
          onClick={async () => {
            setSaving(true);
            try {
              const r = await setMemberRoleAsAdmin({ userId, roleChar, gender });
              setCode(r.memberCode);
              message.success(`Member ID updated → ${r.memberCode}`);
              void qc.invalidateQueries();
            } catch (e: unknown) {
              message.error(e instanceof Error ? e.message : "Failed to update member ID");
            } finally {
              setSaving(false);
            }
          }}
        >
          Update
        </Button>
      </div>
    </div>
  );
}
