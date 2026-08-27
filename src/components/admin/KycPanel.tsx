import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Table, Tag, Input, Segmented, Typography } from "antd";
import { listKycAsAdmin, type KycRow } from "./adminUserApi";

const { Title, Text } = Typography;

function Cell({ ok, name }: { ok: boolean; name: string | null }) {
  if (!ok) return <Tag className="w-fit">—</Tag>;
  return (
    <div className="flex flex-col">
      <Tag color="success" className="w-fit">
        Verified
      </Tag>
      {name && (
        <span className="mt-0.5 max-w-[160px] truncate text-xs text-muted-foreground">{name}</span>
      )}
    </div>
  );
}

const score = (x: KycRow) =>
  (x.aadhaarVerified ? 1 : 0) +
  (x.dlVerified ? 1 : 0) +
  (x.panVerified ? 1 : 0) +
  (x.bankVerified ? 1 : 0);

/** Read-only board of every member's automatic KYC status. No approval step —
 *  verification happens automatically via Sandbox; this is visibility only. */
export function KycPanel() {
  const { data = [], isLoading } = useQuery({ queryKey: ["admin-kyc"], queryFn: listKycAsAdmin });
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "drivers" | "verified">("all");

  const rows = useMemo(() => {
    let r = data;
    if (filter === "drivers") r = r.filter((x) => x.isDriver);
    if (filter === "verified") r = r.filter((x) => score(x) > 0);
    const term = q.trim().toLowerCase();
    if (term) {
      r = r.filter((x) =>
        [x.name, x.email, x.phone, x.aadhaarName, x.panName, x.bankName].some((v) =>
          (v || "").toLowerCase().includes(term),
        ),
      );
    }
    return [...r].sort((a, b) => score(b) - score(a));
  }, [data, q, filter]);

  const columns = [
    {
      title: "Member",
      key: "member",
      render: (_: unknown, x: KycRow) => (
        <div className="flex flex-col">
          <span className="font-semibold">{x.name || "—"}</span>
          <span className="text-xs text-muted-foreground">
            {x.email || x.phone || x.userId.slice(-6)}
          </span>
        </div>
      ),
    },
    { title: "Aadhaar", key: "aadhaar", render: (_: unknown, x: KycRow) => <Cell ok={x.aadhaarVerified} name={x.aadhaarName} /> },
    { title: "Licence", key: "dl", render: (_: unknown, x: KycRow) => <Cell ok={x.dlVerified} name={x.dlName} /> },
    { title: "PAN", key: "pan", render: (_: unknown, x: KycRow) => <Cell ok={x.panVerified} name={x.panName} /> },
    { title: "Bank", key: "bank", render: (_: unknown, x: KycRow) => <Cell ok={x.bankVerified} name={x.bankName} /> },
  ];

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Title level={4} style={{ margin: 0 }}>
            Driver KYC
          </Title>
          <Text type="secondary">
            Automatic verification status — Aadhaar, licence, PAN &amp; bank. Read-only.
          </Text>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as "all" | "drivers" | "verified")}
            options={[
              { label: "All", value: "all" },
              { label: "Drivers", value: "drivers" },
              { label: "Verified", value: "verified" },
            ]}
          />
          <Input.Search
            placeholder="Search name / email / phone"
            allowClear
            value={q}
            onChange={(e) => setQ(e.target.value)}
            style={{ width: 240 }}
          />
        </div>
      </div>
      <Table
        rowKey="userId"
        loading={isLoading}
        dataSource={rows}
        columns={columns as any}
        pagination={{ pageSize: 20, showSizeChanger: false }}
        scroll={{ x: 720 }}
      />
    </div>
  );
}
