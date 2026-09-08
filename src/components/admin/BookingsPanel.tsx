import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Typography, Table, Tag, Space, Button, Popconfirm, Select, Input, Drawer, message } from "antd";
import {
  listAllBookings,
  listAllTrips,
  listDriverProfiles,
  updateBookingStatus,
} from "@/data/appwrite-repository";
import { getBookingPassengers } from "@/lib/booking-passengers";
import { passengerGenderLabel, passengerSeatLabel } from "@/lib/passenger-display";
import { formatBookingCode } from "@/lib/bookingCode";
import type { Booking, BookingStatus } from "@/lib/domain";

const { Title, Text } = Typography;

const STATUS_COLOR: Record<BookingStatus, string> = {
  pending: "default",
  confirmed: "processing",
  completed: "success",
  cancelled: "error",
  no_show: "error",
};

const STATUS_OPTIONS: { label: string; value: BookingStatus | "all" }[] = [
  { label: "All", value: "all" },
  { label: "Pending", value: "pending" },
  { label: "Confirmed", value: "confirmed" },
  { label: "Completed", value: "completed" },
  { label: "Cancelled", value: "cancelled" },
  { label: "No-show", value: "no_show" },
];

export function BookingsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<BookingStatus | "all">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Booking | null>(null);

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => listAllBookings(1000),
  });
  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["admin-all-trips"],
    queryFn: () => listAllTrips(1000),
  });
  const { data: drivers = [] } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: listDriverProfiles,
  });

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  // Running booking number, oldest = 0001, assigned across ALL bookings.
  const sequenceById = useMemo(() => {
    const sorted = [...bookings].sort((a, b) => {
      const ta = new Date(a.createdAt).getTime();
      const tb = new Date(b.createdAt).getTime();
      if (ta !== tb) return ta - tb;
      return a.id.localeCompare(b.id);
    });
    const m = new Map<string, number>();
    sorted.forEach((b, i) => m.set(b.id, i + 1));
    return m;
  }, [bookings]);
  const bookingCode = (b: Booking) =>
    formatBookingCode({ createdAt: b.createdAt, sequence: sequenceById.get(b.id) ?? 0 });
  const hostNameByUserId = useMemo(() => {
    const m = new Map<string, string>();
    drivers.forEach((d) => m.set(d.userId, d.fullName));
    return m;
  }, [drivers]);

  const cancelMutation = useMutation({
    mutationFn: (bookingId: string) => updateBookingStatus(bookingId, "cancelled"),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-all-bookings"] });
      message.success("Booking cancelled");
    },
    onError: (error: any) => message.error(error.message),
  });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = statusFilter === "all" ? bookings : bookings.filter((b) => b.status === statusFilter);
    if (q) {
      list = list.filter((b) => {
        const trip = tripById.get(b.tripId);
        const route = trip ? `${trip.fromLocation} ${trip.toLocation}` : "";
        const code = formatBookingCode({ createdAt: b.createdAt, sequence: sequenceById.get(b.id) ?? 0 });
        return (
          (b.passengerName || "").toLowerCase().includes(q) ||
          (b.passengerPhone || "").toLowerCase().includes(q) ||
          route.toLowerCase().includes(q) ||
          code.toLowerCase().includes(q)
        );
      });
    }
    return list;
  }, [bookings, statusFilter, search, tripById, sequenceById]);

  const selectedTrip = selected ? tripById.get(selected.tripId) : undefined;

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Booking Manager
        </Title>
        <Text type="secondary">Every booking on the platform. Tap one for full details.</Text>
      </div>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <div className="px-4 pt-4 flex flex-wrap items-center justify-between gap-3">
          <Input.Search
            allowClear
            placeholder="Search by booking ID, passenger, phone, or route…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ maxWidth: 360 }}
          />
          <Select value={statusFilter} onChange={setStatusFilter} options={STATUS_OPTIONS} style={{ width: 180 }} />
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="id"
          loading={bookingsLoading || tripsLoading}
          dataSource={filtered}
          locale={{ emptyText: "No bookings found." }}
          pagination={{ pageSize: 10 }}
          onRow={(b) => ({ onClick: () => setSelected(b), style: { cursor: "pointer" } })}
          columns={[
            {
              title: "Booking ID",
              key: "id",
              width: 170,
              render: (_, b) => {
                const code = bookingCode(b);
                return (
                  <span onClick={(e) => e.stopPropagation()}>
                    <Text
                      copyable={{ text: code, tooltips: ["Copy ID", "Copied"] }}
                      className="font-mono text-xs whitespace-nowrap"
                    >
                      {code}
                    </Text>
                  </span>
                );
              },
            },
            {
              title: "Passenger",
              key: "passenger",
              render: (_, b) => (
                <div>
                  <Text strong>{b.passengerName}</Text>
                  <div className="text-xs text-muted-foreground">{b.passengerPhone}</div>
                </div>
              ),
            },
            {
              title: "Route",
              key: "route",
              render: (_, b) => {
                const trip = tripById.get(b.tripId);
                return trip ? (
                  <Text>
                    {trip.fromLocation.split(",")[0]} → {trip.toLocation.split(",")[0]}
                  </Text>
                ) : (
                  <Text type="secondary">Trip not found</Text>
                );
              },
            },
            { title: "Seats", dataIndex: "seatsBooked", key: "seats" },
            { title: "Price", key: "price", render: (_, b) => `₹${b.segmentPrice}` },
            {
              title: "Status",
              key: "status",
              render: (_, b) => (
                <Tag color={STATUS_COLOR[b.status]} bordered={false} className="capitalize px-3 rounded-3xl">
                  {b.status === "no_show" ? "No-show" : b.status}
                </Tag>
              ),
            },
            {
              title: "Actions",
              key: "actions",
              render: (_, b) => (
                <Popconfirm
                  title="Cancel this booking?"
                  onConfirm={(e) => {
                    e?.stopPropagation();
                    cancelMutation.mutate(b.id);
                  }}
                  onCancel={(e) => e?.stopPropagation()}
                  okText="Cancel booking"
                  okButtonProps={{ danger: true }}
                  disabled={b.status === "cancelled" || b.status === "completed" || b.status === "no_show"}
                >
                  <Button
                    type="text"
                    danger
                    size="small"
                    onClick={(e) => e.stopPropagation()}
                    disabled={
                      b.status === "cancelled" ||
                      b.status === "completed" ||
                      b.status === "no_show" ||
                      cancelMutation.isPending
                    }
                  >
                    Cancel
                  </Button>
                </Popconfirm>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        placement="right"
        width={Math.min(480, typeof window !== "undefined" ? window.innerWidth : 480)}
        title="Booking detail"
      >
        {selected && (
          <div className="space-y-4 text-sm">
            <div className="rounded-2xl bg-gray-50 p-4 space-y-1">
              <Text copyable={{ text: bookingCode(selected) }} className="font-mono text-xs text-muted-foreground">
                {bookingCode(selected)}
              </Text>
              <div className="font-semibold">
                {selectedTrip
                  ? `${selectedTrip.fromLocation.split(",")[0]} → ${selectedTrip.toLocation.split(",")[0]}`
                  : "Trip not found"}
              </div>
              <div className="text-muted-foreground">
                {selectedTrip ? new Date(selectedTrip.departureAt).toLocaleString("en-IN") : "—"}
              </div>
              <div className="text-muted-foreground">
                Host:{" "}
                {selectedTrip
                  ? selectedTrip.hostDisplayName || hostNameByUserId.get(selectedTrip.hostId) || "Host"
                  : "—"}
              </div>
              <div className="text-muted-foreground">
                Paid ₹{selected.segmentPrice} · {selected.seatsBooked} seat(s) ·{" "}
                {selected.otp ? `OTP ${selected.otp}${selected.verified ? " ✓" : ""}` : "no OTP"}
              </div>
            </div>
            <div>
              <Text strong className="block mb-2">
                Passengers
              </Text>
              <div className="space-y-1.5">
                {getBookingPassengers(selected).map((p, i) => (
                  <div key={i} className="flex items-center justify-between rounded-xl border border-gray-100 px-3 py-2">
                    <span>
                      {p.name}
                      {" "}
                      ({passengerGenderLabel(p.gender)}) · {p.phone}
                    </span>
                    <span className="text-muted-foreground">{passengerSeatLabel(p.seatCode)}</span>
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
