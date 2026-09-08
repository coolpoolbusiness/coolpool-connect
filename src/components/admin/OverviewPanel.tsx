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
  ChevronRight,
} from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import {
  listAllBookings,
  listAllTrips,
  listAllVehicles,
  listDriverProfiles,
} from "@/data/appwrite-repository";
import { listPayoutRequestsAsAdmin } from "@/components/admin/adminUserApi";
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

  const { data: payoutRequests = [] } = useQuery({
    queryKey: ["admin-payout-requests"],
    queryFn: () => listPayoutRequestsAsAdmin(500),
  });

  const loading = driversLoading || vehiclesLoading || tripsLoading || bookingsLoading;

  const openPayouts = payoutRequests.filter(
    (r) => r.status === "pending" || r.status === "processing" || r.status === "part_paid",
  ).length;

  // Bookings over the last 14 days, for the mini bar chart.
  const bookingsByDay = (() => {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const days: { day: string; bookings: number; ts: number }[] = [];
    for (let i = 13; i >= 0; i--) {
      const d = new Date(start);
      d.setDate(d.getDate() - i);
      days.push({
        day: d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
        bookings: 0,
        ts: d.getTime(),
      });
    }
    for (const b of bookings) {
      const t = new Date(b.createdAt).getTime();
      const slot = days.find((x) => t >= x.ts && t < x.ts + 86400000);
      if (slot) slot.bookings += 1;
    }
    return days;
  })();

  // Most popular routes by number of trips.
  const topRoutes = (() => {
    const m = new Map<string, number>();
    for (const t of trips) {
      const r = `${t.fromLocation.split(",")[0]} → ${t.toLocation.split(",")[0]}`;
      m.set(r, (m.get(r) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  })();

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

      {/* Action needed — a quick "what's waiting on me" summary. */}
      {(pendingVerifications > 0 || openPayouts > 0) && (
        <div className="grid gap-4 sm:grid-cols-2">
          {pendingVerifications > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("verifications")}
              className="flex items-center gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left transition hover:bg-amber-100/70"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500 text-white">
                <AlertTriangle size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-amber-900">
                  {pendingVerifications} verification{pendingVerifications > 1 ? "s" : ""} waiting
                </p>
                <p className="text-sm text-amber-700/80">Review selfies & IDs</p>
              </div>
              <ChevronRight size={18} className="text-amber-400" />
            </button>
          )}
          {openPayouts > 0 && (
            <button
              type="button"
              onClick={() => onNavigate("payouts")}
              className="flex items-center gap-3 rounded-2xl border border-primary/20 bg-primary/5 p-4 text-left transition hover:bg-primary/10"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-white">
                <Wallet size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="font-bold text-gray-900">
                  {openPayouts} payout{openPayouts > 1 ? "s" : ""} to process
                </p>
                <p className="text-sm text-muted-foreground">Pay hosts their earnings</p>
              </div>
              <ChevronRight size={18} className="text-primary/50" />
            </button>
          )}
        </div>
      )}

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

      {/* Analytics — bookings trend + top routes */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card
          className="rounded-3xl border-none shadow-soft bg-white/80 backdrop-blur-sm lg:col-span-2"
          styles={{ body: { padding: "24px 24px 12px" } }}
          style={{ outline: "none" }}
        >
          <Title level={4} style={{ margin: 0 }}>Bookings — last 14 days</Title>
          <div className="mt-4 h-[220px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={bookingsByDay} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 10, fill: "#9aa" }}
                  interval={1}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip
                  cursor={{ fill: "rgba(108,92,231,0.08)" }}
                  contentStyle={{ borderRadius: 12, border: "1px solid #eee", fontSize: 12 }}
                />
                <Bar dataKey="bookings" radius={[6, 6, 0, 0]} maxBarSize={26}>
                  {bookingsByDay.map((_, i) => (
                    <Cell key={i} fill="#6C5CE7" />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card
          className="rounded-3xl border-none shadow-soft bg-white/80 backdrop-blur-sm"
          styles={{ body: { padding: "24px" } }}
          style={{ outline: "none" }}
        >
          <Title level={4} style={{ margin: 0 }}>Top routes</Title>
          <div className="mt-4 space-y-3">
            {topRoutes.length === 0 ? (
              <Text type="secondary" className="text-sm">No trips yet.</Text>
            ) : (
              topRoutes.map(([route, count], i) => (
                <div key={route} className="flex items-center gap-3">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-800">
                    {route}
                  </span>
                  <span className="shrink-0 text-sm font-bold text-primary">{count}</span>
                </div>
              ))
            )}
          </div>
        </Card>
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
