import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Typography, Table, Tag, Space, Button, Popconfirm, Select, Input, Drawer, message } from "antd";
import {
  listAllTrips,
  listAllBookings,
  listAllVehicles,
  listDriverProfiles,
  updateTrip,
} from "@/data/appwrite-repository";
import { getBookingPassengers } from "@/lib/booking-passengers";
import { passengerGenderLabel, passengerSeatLabel } from "@/lib/passenger-display";
import { hostNetEarnings } from "@/lib/pricing";
import type { Trip, TripStatus } from "@/lib/domain";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<TripStatus, string> = {
  scheduled: "blue",
  in_progress: "processing",
  completed: "success",
  cancelled: "error",
  expired: "default",
};

const STATUS_OPTIONS: { label: string; value: TripStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In progress", value: "in_progress" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
];

export function TripsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<TripStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Trip | null>(null);

  const { data: trips = [], isLoading } = useQuery({
    queryKey: ["admin-all-trips"],
    queryFn: () => listAllTrips(1000),
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => listAllBookings(1000),
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: listDriverProfiles,
  });
  const { data: vehicles = [] } = useQuery({
    queryKey: ["admin-all-vehicles"],
    queryFn: listAllVehicles,
  });

  const hostNameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    drivers.forEach((d) => m.set(d.userId, d.fullName));
    return m;
  }, [drivers]);

  const cancelMutation = useMutation({
    mutationFn: (tripId: string) => updateTrip(tripId, { status: "cancelled" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-trips"] });
      queryClient.invalidateQueries({ queryKey: ["admin-active-trips"] });
      message.success("Trip cancelled");
    },
    onError: (error: any) => message.error(error.message),
  });

  const hostName = (t: Trip) => t.hostDisplayName || hostNameByUserId.get(t.hostId) || "Host";

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = statusFilter === "all" ? trips : trips.filter((t) => t.status === statusFilter);
    if (q) {
      list = list.filter(
        (t) =>
          t.fromLocation.toLowerCase().includes(q) ||
          t.toLocation.toLowerCase().includes(q) ||
          t.id.toLowerCase().includes(q) ||
          (t.tripCode ?? "").toLowerCase().includes(q) ||
          hostName(t).toLowerCase().includes(q),
      );
    }
    return list;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trips, statusFilter, search, hostNameByUserId]);

  const detail = useMemo(() => {
    if (!selected) return null;
    const tb = bookings.filter((b) => b.tripId === selected.id && b.status !== "cancelled");
    const gross = tb.reduce((s, b) => s + b.segmentPrice * b.seatsBooked, 0);
    const passengers = tb.flatMap((b) =>
      getBookingPassengers(b).map((p) => ({ ...p, verified: b.verified, otp: b.otp })),
    );
    const car = vehicles.find((v) => v.id === selected.vehicleId);
    return { passengers, gross, car };
  }, [selected, bookings, vehicles]);

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Trip Manager
        </Title>
        <Text type="secondary">
          Live monitoring of all routes. Tap a trip to see the host, car, passengers and money.
        </Text>
      </div>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-3">
          <Input.Search
            allowClear
            placeholder="Search by route or host…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} style={{ width: 180 }} />
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="id"
          loading={isLoading}
          dataSource={filtered}
          locale={{ emptyText: "No trips found." }}
          pagination={{ pageSize: 10 }}
          onRow={(t) => ({ onClick: () => setSelected(t), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "Trip ID",
              key: "id",
              width: 170,
              render: (_, trip) => (
                <span onClick={(e) => e.stopPropagation()}>
                  <Text
                    copyable={{ text: trip.tripCode ?? trip.id, tooltips: ["Copy ID", "Copied"] }}
                    className="font-mono text-xs whitespace-nowrap"
                  >
                    {trip.tripCode ?? `${trip.id.slice(0, 8)}…`}
                  </Text>
                </span>
              ),
            },
            {
              title: "Route",
              key: "route",
              render: (_, trip) => (
                <div>
                  <Text strong>
                    {trip.fromLocation.split(",")[0]} → {trip.toLocation.split(",")[0]}
                  </Text>
                  <div className="text-xs text-muted-foreground">{hostName(trip)}</div>
                </div>
              ),
            },
            { title: "Departure", key: "departure", render: (_, trip) => new Date(trip.departureAt).toLocaleString() },
            { title: "Seats", dataIndex: "totalSeats", key: "seats" },
            { title: "Price", key: "price", render: (_, trip) => `₹${trip.totalPrice}` },
            {
              title: "Status",
              key: "status",
              render: (_, trip) => (
                <Tag color={STATUS_COLOR[trip.status]} bordered={false} className="capitalize px-3 rounded-3xl">
                  {trip.status?.replace("_", " ")}
                </Tag>
              ),
            },
            {
              title: "Actions",
              key: "actions",
              render: (_, trip) => (
                <Space>
                  <Popconfirm
                    title="Cancel this trip?"
                    onConfirm={(e) => {
                      e?.stopPropagation();
                      cancelMutation.mutate(trip.id);
                    }}
                    onCancel={(e) => e?.stopPropagation()}
                    okText="Cancel trip"
                    okButtonProps={{ danger: true }}
                    disabled={trip.status === "cancelled" || trip.status === "completed"}
                  >
                    <Button
                      type="text"
                      danger
                      size="small"
                      onClick={(e) => e.stopPropagation()}
                      disabled={
                        trip.status === "cancelled" || trip.status === "completed" || cancelMutation.isPending
                      }
                    >
                      Cancel
                    </Button>
                  </Popconfirm>
                </Space>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        placement="right"
        width={Math.min(520, typeof window !== "undefined" ? window.innerWidth : 520)}
        title={selected ? `${selected.fromLocation.split(",")[0]} → ${selected.toLocation.split(",")[0]}` : ""}
      >
        {selected && detail && (
          <div className="space-y-5 text-sm">
            <div className="rounded-2xl bg-gray-50 p-4 space-y-1">
              <div className="flex items-center justify-between">
                <Text strong>{hostName(selected)}</Text>
                <Tag color={STATUS_COLOR[selected.status]} bordered={false} className="capitalize m-0">
                  {selected.status?.replace("_", " ")}
                </Tag>
              </div>
              <div className="text-muted-foreground">
                {new Date(selected.departureAt).toLocaleString("en-IN")}
                {selected.totalDistanceKm ? ` · ${selected.totalDistanceKm} km` : ""}
              </div>
              <div className="text-muted-foreground">
                Car: {detail.car ? `${detail.car.modelName} · ${detail.car.plateNumber}` : selected.vehicleModel || "—"}
              </div>
              <div className="pt-1">
                Collected ₹{detail.gross} · platform 5% ₹{detail.gross - hostNetEarnings(detail.gross)} ·{" "}
                <span className="font-semibold text-emerald-700">host net ₹{hostNetEarnings(detail.gross)}</span>
              </div>
            </div>

            <div>
              <Text strong className="block mb-2">
                Passengers ({detail.passengers.length})
              </Text>
              {detail.passengers.length === 0 && <Text type="secondary">No passengers.</Text>}
              <div className="space-y-1.5">
                {detail.passengers.map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                    <span>
                      {p.name}
                      {" "}
                      ({passengerGenderLabel(p.gender)}) · {p.phone}
                    </span>
                    <span className="text-muted-foreground">
                      {passengerSeatLabel(p.seatCode)}
                      {p.verified ? " ✓" : ""}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </Drawer>
    </div>
  );
}
