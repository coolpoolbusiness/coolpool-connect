import { useQuery } from "@tanstack/react-query";
import { Card, Typography, Table, Tag } from "antd";
import { listActionLogAsAdmin } from "./adminUserApi";

const { Title, Text } = Typography;

const ACTION_LABEL: Record<string, string> = {
  payout_status: "Payout status",
  payout_route: "Route payout",
  member_role: "Member role",
  contact_status: "Contact status",
};

export function ActionLogPanel() {
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin-action-log"],
    queryFn: listActionLogAsAdmin,
  });

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Activity Log
        </Title>
        <Text type="secondary">A record of admin actions — payouts, verifications and more.</Text>
      </div>
      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <Table
          scroll={{ x: "max-content" }}
          rowKey="id"
          loading={isLoading}
          dataSource={data}
          pagination={{ pageSize: 15 }}
          locale={{ emptyText: "No activity recorded yet." }}
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
            { title: "Admin", dataIndex: "adminName", key: "admin" },
            {
              title: "Action",
              key: "action",
              render: (_, r) => (
                <Tag bordered={false} className="rounded-full capitalize">
                  {ACTION_LABEL[r.action] ?? r.action.replace(/_/g, " ")}
                </Tag>
              ),
            },
            {
              title: "Target",
              key: "target",
              render: (_, r) => (
                <Text className="text-sm">{r.targetLabel || r.targetId || "—"}</Text>
              ),
            },
            {
              title: "Details",
              dataIndex: "details",
              key: "details",
              render: (v: string) => <Text type="secondary" className="text-sm">{v || "—"}</Text>,
            },
          ]}
        />
      </Card>
    </div>
  );
}
