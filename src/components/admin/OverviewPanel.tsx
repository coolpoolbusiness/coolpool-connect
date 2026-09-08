import { useQuery } from "@tanstack/react-query";
import { Card, Typography, Tag, List } from "antd";
import {
  AlertTriangle,
  Car,
  CheckCircle,
  Route as RouteIcon,
  Ticket,
  Users,
  Wallet,
} from "lucide-react";
import {
  listAllBookings,
  listAllTrips,
  listAllVehicles,
  listDriverProfiles,
} from "@/data/appwrite-repository";
import { platformFee, PLATFORM_FEE_PERCENT } from "@/lib/pricing";

const { Title, Text } = Typography;

const STAT_COLORS: Record<string, { bg: string; text: string }> = {
  purple:   { bg: "#ede9f6", text: "#6b46c1" },
  geekblue: { bg: "#e8eeff", text: "#3164d3" },
  blue:     { bg: "#e6f4ff", text: "#1677ff" },
  cyan:     { bg: "#e6fffb", text: "#13c2c2" },
  success:  { bg: "#f6ffed", text: "#52c41a" },
  gold:     { bg: "#fffbe6", text: "#d4a017" },
  warning:  { bg: "#fff7e6", text: "#faad14" },
};

export function OverviewPanel({ onNavigate }: { onNavigate: (key: string) => void }) {
  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: listDriverProfiles,
  });
  const { data: vehicles = [], isLoading: vehiclesLoading } = useQuery({
    queryKey: ["admin-vehicles"],
    queryFn: listAllVehicles,
  });
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["admin-all-trips"],
    queryFn: () => listAllTrips(500),
  });
  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => listAllBookings(500),
  });

  const loading = driversLoading || vehiclesLoading || tripsLoading || bookingsLoading;

  const activeTrips = trips.filter((t) => t.status === "scheduled" || t.status === "in_progress");
  const completedTrips = trips.filter((t) => t.status === "completed").length;
  const revenue = bookings
    .filter((b) => b.status === "confirmed" || b.status === "completed")
    .reduce((sum, b) => sum + (b.segmentPrice || 0) * (b.seatsBooked || 1), 0);
  const pendingDriverVerifications = drivers.filter((d) => d.verificationStatus === "pending").length;
  const pendingVehicleVerifications = vehicles.filter((v) => v.verificationStatus === "pending").length;
  const pendingVerifications = pendingDriverVerifications + pendingVehicleVerifications;

  const stats = [
    {
      label: "Hosts + Drivers",
      value: drivers.length,
      icon: <Users size={28} />,
      tag: "Active network",
      tagColor: "purple",
      onClick: () => onNavigate("hosts"),
    },
    {
      label: "Total Vehicles",
      value: vehicles.length,
      icon: <Car size={28} />,
      tag: "Registered fleet",
      tagColor: "geekblue",
      onClick: () => onNavigate("hosts"),
    },
    {
      label: "Total Trips",
      value: trips.length,
      icon: <RouteIcon size={28} />,
      tag: `${activeTrips.length} active`,
      tagColor: "blue",
      onClick: () => onNavigate("trips"),
    },
    {
      label: "Completed Trips",
      value: completedTrips,
      icon: <CheckCircle size={28} />,
      tag: "Successfully finished",
      tagColor: "success",
      onClick: () => onNavigate("trips"),
    },
    {
      label: "Total Bookings",
      value: bookings.length,
      icon: <Ticket size={28} />,
      tag: `${bookings.filter((b) => b.status === "confirmed").length} confirmed`,
      tagColor: "cyan",
      onClick: () => onNavigate("bookings"),
    },
    {
      label: "Revenue (confirmed)",
      value: `₹${revenue.toLocaleString("en-IN")}`,
      icon: <Wallet size={28} />,
      tag: "Confirmed + completed",
      tagColor: "cyan",
      onClick: () => onNavigate("bookings"),
    },
    {
      label: "Platform earnings",
      value: `₹${platformFee(revenue).toLocaleString("en-IN")}`,
      icon: <Wallet size={28} />,
      tag: `${PLATFORM_FEE_PERCENT}% commission`,
      tagColor: "gold",
      onClick: () => onNavigate("bookings"),
    },
    {
      label: "Pending Verifications",
      value: pendingVerifications,
      icon: <AlertTriangle size={28} />,
      tag: pendingVerifications > 0 ? "Needs review" : "All clear",
      tagColor: pendingVerifications > 0 ? "warning" : "success",
      onClick: () => onNavigate("verifications"),
    },
  ];

  const recentBookings = [...bookings]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);
  const recentTrips = [...trips]
    .sort((a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime())
    .slice(0, 5);

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col gap-2">
        <Title level={1} style={{ margin: 0 }}>
          Administrator Control
        </Title>
        <Text type="secondary" className="text-lg">
          Monitoring the pulse of Coolpool's intercity ride-sharing network.
        </Text>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {stats.map((s) => {
          const colors = STAT_COLORS[s.tagColor] ?? STAT_COLORS.purple;
          return (
            <Card
              key={s.label}
              onClick={s.onClick}
              className="rounded-3xl border-none shadow-soft hover:shadow-card transition-base bg-white/80 backdrop-blur-sm cursor-pointer group overflow-hidden"
              styles={{ body: { padding: "28px 28px 24px" } }}
              style={{ outline: "none" }}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div
                  className="rounded-2xl flex items-center justify-center flex-shrink-0"
                  style={{
                    width: 60,
                    height: 60,
                    background: colors.bg,
                    color: colors.text,
                  }}
                >
                  {s.icon}
                </div>
                <Tag
                  color={s.tagColor}
                  bordered={false}
                  className="rounded-2xl text-xs font-semibold mt-1"
                  style={{ whiteSpace: "normal", wordBreak: "break-word", maxWidth: "100%" }}
                >
                  {s.tag}
                </Tag>
              </div>
              <div className="mt-5">
                <div className="text-3xl font-extrabold leading-none tracking-tight" style={{ color: "#1a1a2e" }}>
                  {loading ? (
                    <span className="inline-block h-7 w-16 animate-pulse rounded-lg bg-gray-200" />
                  ) : (
                    s.value
                  )}
                </div>
                <Text type="secondary" className="text-sm mt-2 block group-hover:text-primary transition-colors">
                  {s.label}
                </Text>
              </div>
            </Card>
          );
        })}
      </div>

      <div className="flex flex-col gap-8">
        <Card
          className="rounded-3xl border-none shadow-soft bg-white/80 backdrop-blur-sm overflow-hidden"
          styles={{ body: { padding: 0 } }}
          style={{ outline: "none" }}
        >
          <div className="px-8 py-6 border-b border-border/60 flex items-center justify-between">
            <Title level={4} style={{ margin: 0 }}>Recent Bookings</Title>
            <span
              className="text-sm font-semibold text-primary cursor-pointer hover:underline"
              onClick={() => onNavigate("bookings")}
            >
              View all
            </span>
          </div>
          <List
            style={{ padding: "4px 32px 12px" }}
            itemLayout="horizontal"
            loading={bookingsLoading}
            dataSource={recentBookings}
            locale={{ emptyText: "No bookings yet." }}
            renderItem={(b) => (
              <List.Item style={{ padding: "20px 0" }}>
                <List.Item.Meta
                  title={<Text strong className="text-base">{b.passengerName}</Text>}
                  description={
                    <span className="text-sm">{b.seatsBooked} seat(s) · ₹{b.segmentPrice}</span>
                  }
                />
                <Tag
                  color={
                    b.status === "confirmed" ? "processing"
                    : b.status === "completed" ? "success"
                    : b.status === "cancelled" ? "error"
                    : "default"
                  }
                  bordered={false}
                  className="capitalize text-sm"
                >
                  {b.status}
                </Tag>
              </List.Item>
            )}
          />
        </Card>

        <Card
          className="rounded-3xl border-none shadow-soft bg-white/80 backdrop-blur-sm overflow-hidden"
          styles={{ body: { padding: 0 } }}
          style={{ outline: "none" }}
        >
          <div className="px-8 py-6 border-b border-border/60 flex items-center justify-between">
            <Title level={4} style={{ margin: 0 }}>Recent Trips</Title>
            <span
              className="text-sm font-semibold text-primary cursor-pointer hover:underline"
              onClick={() => onNavigate("trips")}
            >
              View all
            </span>
          </div>
          <List
            style={{ padding: "4px 32px 12px" }}
            itemLayout="horizontal"
            loading={tripsLoading}
            dataSource={recentTrips}
            locale={{ emptyText: "No trips found." }}
            renderItem={(trip) => (
              <List.Item style={{ padding: "20px 0" }}>
                <List.Item.Meta
                  title={
                    <Text strong className="text-base">
                      {trip.fromLocation.split(",")[0]} → {trip.toLocation.split(",")[0]}
                    </Text>
                  }
                  description={
                    <span className="text-sm">
                      {new Date(trip.departureAt).toLocaleString()} · ₹{trip.totalPrice}
                    </span>
                  }
                />
                <Tag
                  color={
                    trip.status === "in_progress" ? "processing"
                    : trip.status === "completed" ? "success"
                    : trip.status === "cancelled" ? "error"
                    : "blue"
                  }
                  bordered={false}
                  className="capitalize text-sm"
                >
                  {trip.status?.replace("_", " ")}
                </Tag>
              </List.Item>
            )}
          />
        </Card>
      </div>
    </div>
  );
}
