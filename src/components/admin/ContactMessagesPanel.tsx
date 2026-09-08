import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Typography, Table, Tag, Button, Segmented, message } from "antd";
import { Mail, Check, RotateCcw } from "lucide-react";
import { listContactMessagesAsAdmin, setContactStatusAsAdmin } from "./adminUserApi";

const { Title, Text, Paragraph } = Typography;

export function ContactMessagesPanel() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"open" | "resolved" | "all">("open");

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-contact-messages"],
    queryFn: listContactMessagesAsAdmin,
  });

  const setStatus = useMutation({
    mutationFn: (v: { id: string; status: "open" | "resolved" }) =>
      setContactStatusAsAdmin(v.id, v.status),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["admin-contact-messages"] });
      message.success("Updated.");
    },
    onError: (e: unknown) => message.error(e instanceof Error ? e.message : "Failed"),
  });

  const filtered = filter === "all" ? data : data.filter((m) => m.status === filter);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Support Messages
        </Title>
        <Text type="secondary">Messages from the Contact form. Reply by email, then resolve.</Text>
      </div>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <div className="px-4 pt-4">
          <Segmented
            value={filter}
            onChange={(v) => setFilter(v as typeof filter)}
            options={[
              { label: `Open (${data.filter((m) => m.status === "open").length})`, value: "open" },
              { label: "Resolved", value: "resolved" },
              { label: "All", value: "all" },
            ]}
          />
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="id"
          loading={isLoading}
          dataSource={filtered}
          pagination={{ pageSize: 10 }}
          locale={{ emptyText: "No messages." }}
          columns={[
            {
              title: "When",
              key: "when",
              render: (_, r) => (
                <Text className="text-sm whitespace-nowrap">
                  {new Date(r.createdAt).toLocaleString("en-IN")}
                </Text>
              ),
            },
            {
              title: "From",
              key: "from",
              render: (_, r) => (
                <div>
                  <Text strong>{r.name}</Text>
                  <div className="text-xs text-muted-foreground">{r.email || "no email"}</div>
                </div>
              ),
            },
            { title: "Topic", dataIndex: "subject", key: "subject", render: (v: string) => v || "—" },
            {
              title: "Message",
              key: "message",
              render: (_, r) => (
                <Paragraph className="!mb-0 max-w-[360px] text-sm" ellipsis={{ rows: 3, expandable: true, symbol: "more" }}>
                  {r.message}
                </Paragraph>
              ),
            },
            {
              title: "Status",
              key: "status",
              render: (_, r) => (
                <Tag color={r.status === "resolved" ? "success" : "warning"} bordered={false} className="rounded-full capitalize">
                  {r.status}
                </Tag>
              ),
            },
            {
              title: "Actions",
              key: "actions",
              render: (_, r) => (
                <div className="flex items-center gap-2">
                  {r.email && (
                    <Button
                      size="small"
                      icon={<Mail size={14} />}
                      href={`mailto:${r.email}?subject=${encodeURIComponent(`Re: ${r.subject || "Your message to Coolpool"}`)}`}
                      target="_blank"
                    >
                      Reply
                    </Button>
                  )}
                  {r.status === "open" ? (
                    <Button
                      size="small"
                      type="primary"
                      icon={<Check size={14} />}
                      loading={setStatus.isPending}
                      onClick={() => setStatus.mutate({ id: r.id, status: "resolved" })}
                    >
                      Resolve
                    </Button>
                  ) : (
                    <Button
                      size="small"
                      icon={<RotateCcw size={14} />}
                      onClick={() => setStatus.mutate({ id: r.id, status: "open" })}
                    >
                      Reopen
                    </Button>
                  )}
                </div>
              ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
