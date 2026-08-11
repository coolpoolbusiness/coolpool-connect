import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Typography, Table, Tag, Button, Segmented, Modal, message, Image, Input } from "antd";
import { ShieldCheck, MapPin } from "lucide-react";
import {
  adminGetPrivateFileUrl,
  listMemberVerificationsAsAdmin,
  setMemberVerificationAsAdmin,
  listNoShowReportsAsAdmin,
  setNoShowStatusAsAdmin,
} from "./adminUserApi";

const { Title, Text } = Typography;

function fmt(d: string | null | undefined) {
  return d ? new Date(d).toLocaleString("en-IN") : "—";
}

/** Loads a private image (selfie / no-show photo) on demand via the admin
 *  server function and shows it in a modal. */
function PrivatePhotoButton({ fileId, label }: { fileId: string | null | undefined; label: string }) {
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  if (!fileId) return <Text type="secondary">—</Text>;
  const view = async () => {
    setOpen(true);
    if (url) return;
    setLoading(true);
    try {
      setUrl(await adminGetPrivateFileUrl(fileId));
    } catch (e) {
      message.error(e instanceof Error ? e.message : "Couldn't load photo.");
      setOpen(false);
    } finally {
      setLoading(false);
    }
  };
  return (
    <>
      <Button size="small" onClick={view}>
        View {label}
      </Button>
      <Modal open={open} onCancel={() => setOpen(false)} footer={null} title={label} centered>
        {loading ? (
          <div className="py-10 text-center text-gray-400">Loading…</div>
        ) : url ? (
          <Image src={url} alt={label} style={{ maxHeight: 480 }} />
        ) : null}
      </Modal>
    </>
  );
}

export function VerificationsPanel() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<"selfies" | "noshows">("selfies");

  const selfies = useQuery({ queryKey: ["admin-verifications"], queryFn: listMemberVerificationsAsAdmin });
  const noshows = useQuery({ queryKey: ["admin-noshows"], queryFn: listNoShowReportsAsAdmin });

  const setSelfie = useMutation({
    mutationFn: (v: { userId: string; status: "approved" | "rejected"; note?: string }) =>
      setMemberVerificationAsAdmin(v.userId, v.status, v.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-verifications"] });
      message.success("Verification updated.");
    },
    onError: (e: any) => message.error(e.message || "Failed."),
  });

  const setNoShow = useMutation({
    mutationFn: (v: { id: string; status: "resolved" | "dismissed"; note?: string }) =>
      setNoShowStatusAsAdmin(v.id, v.status, v.note),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-noshows"] });
      message.success("Report updated.");
    },
    onError: (e: any) => message.error(e.message || "Failed."),
  });

  const statusTag = (s: string) => {
    const color =
      s === "approved" || s === "resolved"
        ? "success"
        : s === "rejected" || s === "dismissed"
          ? "error"
          : "warning";
    return <Tag color={color} className="capitalize">{s}</Tag>;
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Verifications
        </Title>
        <Text type="secondary">
          Review member selfies (private) and guest no-show photo proofs.
        </Text>
      </div>

      <Segmented
        value={tab}
        onChange={(v) => setTab(v as any)}
        options={[
          { label: `Selfies (${selfies.data?.filter((s: any) => s.status === "pending").length ?? 0} pending)`, value: "selfies" },
          { label: `No-shows (${noshows.data?.filter((r: any) => r.status === "open").length ?? 0} open)`, value: "noshows" },
        ]}
      />

      {tab === "selfies" ? (
        <Card className="rounded-3xl border-none shadow-card bg-white/90 p-2 overflow-hidden">
          <Table
            rowKey="$id"
            loading={selfies.isLoading}
            dataSource={selfies.data ?? []}
            locale={{ emptyText: "No selfie submissions yet." }}
            pagination={{ pageSize: 12 }}
            columns={[
              { title: "Member", key: "m", render: (_, r: any) => (
                <div><Text strong>{r.display_name || "—"}</Text><div className="text-xs text-muted-foreground">{r.phone || r.user_id}</div></div>
              ) },
              { title: "Submitted", key: "s", render: (_, r: any) => fmt(r.submitted_at) },
              { title: "Selfie", key: "f", render: (_, r: any) => <PrivatePhotoButton fileId={r.selfie_file_id} label="selfie" /> },
              { title: "Status", key: "st", render: (_, r: any) => statusTag(r.status || "pending") },
              { title: "Actions", key: "a", render: (_, r: any) => (
                <div className="flex gap-2">
                  <Button size="small" type="primary" icon={<ShieldCheck size={13} />}
                    onClick={() => setSelfie.mutate({ userId: r.user_id, status: "approved" })}>
                    Approve
                  </Button>
                  <Button size="small" danger onClick={() => {
                    let note = "";
                    Modal.confirm({
                      title: "Reject selfie",
                      content: <Input placeholder="Reason (shown to member)" onChange={(e) => (note = e.target.value)} />,
                      okText: "Reject", okButtonProps: { danger: true },
                      onOk: () => setSelfie.mutate({ userId: r.user_id, status: "rejected", note }),
                    });
                  }}>
                    Reject
                  </Button>
                </div>
              ) },
            ]}
          />
        </Card>
      ) : (
        <Card className="rounded-3xl border-none shadow-card bg-white/90 p-2 overflow-hidden">
          <Table
            rowKey="$id"
            loading={noshows.isLoading}
            dataSource={noshows.data ?? []}
            locale={{ emptyText: "No no-show reports." }}
            pagination={{ pageSize: 12 }}
            columns={[
              { title: "Passenger", key: "p", render: (_, r: any) => (
                <div><Text strong>{r.passenger_name || "—"}</Text><div className="text-xs text-muted-foreground">booking {String(r.booking_id).slice(-6)}</div></div>
              ) },
              { title: "When", key: "w", render: (_, r: any) => fmt(r.captured_at) },
              { title: "Location", key: "l", render: (_, r: any) =>
                r.lat && r.lng ? (
                  <a href={`https://maps.google.com/?q=${r.lat},${r.lng}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary">
                    <MapPin size={13} /> Map
                  </a>
                ) : <Text type="secondary">—</Text> },
              { title: "Photo", key: "ph", render: (_, r: any) => <PrivatePhotoButton fileId={r.photo_file_id} label="photo" /> },
              { title: "Status", key: "st", render: (_, r: any) => statusTag(r.status || "open") },
              { title: "Actions", key: "a", render: (_, r: any) => r.status === "open" ? (
                <div className="flex gap-2">
                  <Button size="small" type="primary" onClick={() => setNoShow.mutate({ id: r.$id, status: "resolved" })}>Resolve</Button>
                  <Button size="small" onClick={() => setNoShow.mutate({ id: r.$id, status: "dismissed" })}>Dismiss</Button>
                </div>
              ) : <Text type="secondary">{fmt(r.$updatedAt)}</Text> },
            ]}
          />
        </Card>
      )}
    </div>
  );
}
