import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Card,
  Typography,
  Table,
  Tag,
  Button,
  Select,
  Modal,
  Form,
  Input,
  InputNumber,
  message,
  Drawer,
  Popconfirm,
  Dropdown,
} from "antd";
import type { MenuProps } from "antd";
import { Plus, WalletCards, Zap, QrCode, Download, MoreHorizontal } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { downloadCsv } from "@/lib/csv";
import { listDriverProfiles, listAllTrips, listAllBookings } from "@/data/appwrite-repository";
import { hostNetEarnings, estimateFeeFromNet, PLATFORM_FEE_PERCENT } from "@/lib/pricing";
import type { PayoutRequest, PayoutStatus } from "@/lib/domain";
import {
  createPayoutEntryAsAdmin,
  listPayoutRequestsAsAdmin,
  payoutViaRouteAsAdmin,
  updatePayoutRequestAsAdmin,
} from "./adminUserApi";

const { Title, Text } = Typography;

// The "Pay via Route" button only appears once Route is live on the company
// account. Set VITE_RAZORPAY_ROUTE_ENABLED="1" in prod after adding the
// company account's Route keys — until then automatic payouts stay hidden.
const ROUTE_ENABLED = String(import.meta.env.VITE_RAZORPAY_ROUTE_ENABLED ?? "") === "1";

const STATUS_COLORS: Record<PayoutStatus, string> = {
  pending: "warning",
  processing: "processing",
  paid: "success",
  rejected: "error",
  part_paid: "purple",
};

const STATUS_LABELS: Record<PayoutStatus, string> = {
  pending: "Pending",
  processing: "Processing",
  paid: "Paid",
  rejected: "Rejected",
  part_paid: "Part paid",
};

const ALL_STATUSES: PayoutStatus[] = ["pending", "processing", "part_paid", "paid", "rejected"];

/** What the host should actually receive on this row: amount − deduction. */
function payableOf(r: PayoutRequest): number {
  return Math.max(0, r.amount - (r.deduction ?? 0));
}

/** How much of this row has actually been transferred. */
function transferredOf(r: PayoutRequest): number {
  if (r.status === "paid") return payableOf(r);
  if (r.status === "part_paid") return Math.min(r.paidAmount ?? 0, payableOf(r));
  return 0;
}

function formatMoney(amount: number): string {
  return `₹${amount.toLocaleString("en-IN")}`;
}

function formatDateTime(date: string | null | undefined): string {
  if (!date) return "—";
  return new Date(date).toLocaleString("en-IN");
}

/** Platform commission for a request: stored at request time, or estimated for legacy rows. */
function feeFor(r: PayoutRequest): { fee: number; isEstimate: boolean } {
  if (r.platformFee != null) return { fee: r.platformFee, isEstimate: false };
  return { fee: estimateFeeFromNet(r.amount), isEstimate: true };
}

function CommissionCell({ request }: { request: PayoutRequest }) {
  const { fee, isEstimate } = feeFor(request);
  return (
    <Text type="secondary" italic={isEstimate}>
      {isEstimate ? "≈" : ""}
      {formatMoney(fee)}
    </Text>
  );
}

export function PayoutsPanel() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<"all" | PayoutStatus>("all");
  const [actionRequest, setActionRequest] = useState<PayoutRequest | null>(null);
  const [actionType, setActionType] = useState<
    "paid" | "rejected" | "part_paid" | "deduction" | null
  >(null);
  const [detailHostId, setDetailHostId] = useState<string | null>(null);
  const [detailRequestId, setDetailRequestId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [qrRequest, setQrRequest] = useState<PayoutRequest | null>(null);
  const [form] = Form.useForm<{
    paymentReference?: string;
    adminNote?: string;
    deduction?: number;
    paidAmount?: number;
  }>();
  const [addForm] = Form.useForm<{
    driverUserId: string;
    tripId?: string;
    amount: number;
    deduction?: number;
    status: PayoutStatus;
    paymentReference?: string;
    adminNote?: string;
    paidAmount?: number;
  }>();
  const addHostId = Form.useWatch("driverUserId", addForm);
  const addStatus = Form.useWatch("status", addForm);

  const { data: requests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["admin-payout-requests"],
    queryFn: () => listPayoutRequestsAsAdmin(500),
  });

  const { data: drivers = [], isLoading: driversLoading } = useQuery({
    queryKey: ["admin-drivers"],
    queryFn: listDriverProfiles,
  });

  const { data: trips = [] } = useQuery({
    queryKey: ["admin-all-trips"],
    queryFn: () => listAllTrips(1000),
  });
  const { data: bookings = [] } = useQuery({
    queryKey: ["admin-all-bookings"],
    queryFn: () => listAllBookings(1000),
  });

  const driverNameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    drivers.forEach((d) => map.set(d.userId, d.fullName));
    return map;
  }, [drivers]);

  const tripById = useMemo(() => new Map(trips.map((t) => [t.id, t])), [trips]);
  // Human-readable trip id for a payout, e.g. "2607-CPTR-0032". Falls back to
  // a short slice of the raw id for trips minted before codes existed.
  const tripCodeFor = (tripId: string | null | undefined): string | null => {
    if (!tripId) return null;
    return tripById.get(tripId)?.tripCode || `#${tripId.slice(-6).toUpperCase()}`;
  };

  // Net earnings per host = 95% of (price × seats) for non-cancelled bookings
  // on their COMPLETED trips — same rule as the host dashboard/payout panel.
  const earnedByHost = useMemo(() => {
    const grossByHost = new Map<string, number>();
    const completedTripHost = new Map<string, string>();
    for (const t of trips) {
      if (t.status === "completed") completedTripHost.set(t.id, t.hostId);
    }
    for (const b of bookings) {
      if (b.status === "cancelled") continue;
      const host = completedTripHost.get(b.tripId);
      if (!host) continue;
      grossByHost.set(host, (grossByHost.get(host) ?? 0) + b.segmentPrice * b.seatsBooked);
    }
    const net = new Map<string, number>();
    for (const [host, gross] of grossByHost) net.set(host, hostNetEarnings(gross));
    return net;
  }, [trips, bookings]);

  // Actually transferred per host: paid rows settle their payable (amount −
  // deduction); part-paid rows count what's been sent so far.
  const paidByHost = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) {
      const sent = transferredOf(r);
      if (sent > 0) m.set(r.driverUserId, (m.get(r.driverUserId) ?? 0) + sent);
    }
    return m;
  }, [requests]);

  // Platform commission per host, split by whether it's already realized
  // (paid payouts) or still open (pending/processing/part-paid requests).
  const commissionByHost = useMemo(() => {
    const paid = new Map<string, number>();
    const open = new Map<string, number>();
    for (const r of requests) {
      const { fee } = feeFor(r);
      if (r.status === "paid") paid.set(r.driverUserId, (paid.get(r.driverUserId) ?? 0) + fee);
      else if (r.status === "pending" || r.status === "processing" || r.status === "part_paid")
        open.set(r.driverUserId, (open.get(r.driverUserId) ?? 0) + fee);
    }
    return { paid, open };
  }, [requests]);

  // Still-owed commitments: open requests in full, plus the unpaid remainder
  // of part-paid rows.
  const openByHost = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of requests) {
      let openAmount = 0;
      if (r.status === "pending" || r.status === "processing") openAmount = payableOf(r);
      else if (r.status === "part_paid") openAmount = payableOf(r) - transferredOf(r);
      if (openAmount > 0) m.set(r.driverUserId, (m.get(r.driverUserId) ?? 0) + openAmount);
    }
    return m;
  }, [requests]);

  const availableFor = (userId: string) =>
    Math.max(
      0,
      (earnedByHost.get(userId) ?? 0) -
        (paidByHost.get(userId) ?? 0) -
        (openByHost.get(userId) ?? 0),
    );
  const rawAvailableFor = (userId: string) =>
    (earnedByHost.get(userId) ?? 0) - (paidByHost.get(userId) ?? 0) - (openByHost.get(userId) ?? 0);

  // Ledger: one row per host who has earned or transacted.
  const ledger = useMemo(() => {
    const ids = new Set<string>([
      ...earnedByHost.keys(),
      ...paidByHost.keys(),
      ...openByHost.keys(),
    ]);
    return [...ids]
      .map((userId) => ({
        userId,
        name: driverNameByUserId.get(userId) || "Unknown",
        earned: earnedByHost.get(userId) ?? 0,
        paid: paidByHost.get(userId) ?? 0,
        pending: openByHost.get(userId) ?? 0,
        available: availableFor(userId),
        commission:
          (commissionByHost.paid.get(userId) ?? 0) + (commissionByHost.open.get(userId) ?? 0),
      }))
      .sort((a, b) => b.earned - a.earned);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [earnedByHost, paidByHost, openByHost, commissionByHost, driverNameByUserId]);

  const totalEarnings = useMemo(
    () => [...earnedByHost.values()].reduce((s, v) => s + v, 0),
    [earnedByHost],
  );

  const updateMutation = useMutation({
    mutationFn: (vars: {
      id: string;
      status: PayoutStatus;
      paymentReference?: string;
      adminNote?: string;
      deduction?: number | null;
      paidAmount?: number | null;
    }) =>
      updatePayoutRequestAsAdmin(vars.id, {
        status: vars.status,
        paymentReference: vars.paymentReference,
        adminNote: vars.adminNote,
        deduction: vars.deduction,
        paidAmount: vars.paidAmount,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-payout-requests"] });
      message.success("Payout updated.");
      setActionRequest(null);
      setActionType(null);
      form.resetFields();
    },
    onError: (error: any) => message.error(error.message || "Failed to update payout."),
  });

  const simpleStatusMutation = useMutation({
    mutationFn: (vars: { id: string; status: PayoutStatus }) =>
      updatePayoutRequestAsAdmin(vars.id, { status: vars.status }),
    onSuccess: (_, vars) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-payout-requests"] });
      message.success(`Marked as ${STATUS_LABELS[vars.status].toLowerCase()}.`);
    },
    onError: (error: any) => message.error(error.message || "Failed to update payout."),
  });

  const addMutation = useMutation({
    mutationFn: (vars: {
      driverUserId: string;
      amount: number;
      tripId?: string | null;
      deduction?: number;
      status: PayoutStatus;
      paymentReference?: string;
      adminNote?: string;
      paidAmount?: number;
    }) => createPayoutEntryAsAdmin(vars),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["admin-payout-requests"] });
      message.success("Payment recorded.");
      setAddOpen(false);
      addForm.resetFields();
    },
    onError: (error: any) => message.error(error.message || "Failed to record the payment."),
  });

  // Automatic payout via Razorpay Route (onboards the host on first use, then
  // transfers). On success the row flips to Paid with the transfer id.
  const routeMutation = useMutation({
    mutationFn: (vars: { requestId: string }) => payoutViaRouteAsAdmin(vars),
    onSuccess: (res) => {
      void queryClient.invalidateQueries({ queryKey: ["admin-payout-requests"] });
      message.success(`Paid via Route — ${res.paymentReference ?? "transfer created"}.`);
    },
    onError: (error: any) =>
      message.error(error.message || "Route payout failed. Nothing was charged."),
  });

  // One unified ledger — the status filter is the archive.
  const filteredRequests =
    statusFilter === "all" ? requests : requests.filter((r) => r.status === statusFilter);

  const totalPending = requests.reduce((sum, r) => {
    if (r.status === "pending" || r.status === "processing") return sum + payableOf(r);
    if (r.status === "part_paid") return sum + payableOf(r) - transferredOf(r);
    return sum;
  }, 0);

  const totalPaid = requests.reduce((sum, r) => sum + transferredOf(r), 0);

  const totalCommissionOpen = requests
    .filter((r) => r.status === "pending" || r.status === "processing" || r.status === "part_paid")
    .reduce((sum, r) => sum + feeFor(r).fee, 0);

  const totalCommissionPaid = requests
    .filter((r) => r.status === "paid")
    .reduce((sum, r) => sum + feeFor(r).fee, 0);

  const openRequestCount = requests.filter(
    (r) => r.status === "pending" || r.status === "processing" || r.status === "part_paid",
  ).length;

  const openAction = (
    record: PayoutRequest,
    type: "paid" | "rejected" | "part_paid" | "deduction",
  ) => {
    setActionRequest(record);
    setActionType(type);
    form.resetFields();
    form.setFieldsValue({
      paymentReference: record.paymentReference ?? undefined,
      deduction: record.deduction ?? 0,
      paidAmount: record.paidAmount || undefined,
    });
  };

  const openDetails = (record: PayoutRequest) => {
    setDetailHostId(record.driverUserId);
    setDetailRequestId(record.id);
  };

  const submitAction = (values: {
    paymentReference?: string;
    adminNote?: string;
    deduction?: number;
    paidAmount?: number;
  }) => {
    if (!actionRequest || !actionType) return;
    if (actionType === "paid") {
      const payableHeadroom = rawAvailableFor(actionRequest.driverUserId) + actionRequest.amount;
      if (actionRequest.amount > payableHeadroom) {
        message.error(
          `Cannot pay ${formatMoney(actionRequest.amount)}. Only ${formatMoney(Math.max(0, payableHeadroom))} is payable after earlier payouts.`,
        );
        setActionRequest(null);
        setActionType(null);
        form.resetFields();
        return;
      }
    }
    updateMutation.mutate({
      id: actionRequest.id,
      // "deduction" edits keep the row's current status.
      status: actionType === "deduction" ? actionRequest.status : actionType,
      paymentReference: values.paymentReference,
      adminNote: values.adminNote,
      deduction: values.deduction,
      paidAmount: values.paidAmount,
    });
  };

  const detailRequests = useMemo(
    () => requests.filter((r) => r.driverUserId === detailHostId),
    [requests, detailHostId],
  );

  const detailRequest =
    detailRequests.find((r) => r.id === detailRequestId) ?? detailRequests[0] ?? null;
  const detailHostName = detailHostId ? driverNameByUserId.get(detailHostId) || "Unknown" : "";
  const detailOpenRequests = detailRequests.filter(
    (r) => r.status === "pending" || r.status === "processing" || r.status === "part_paid",
  );
  const detailPaidRequests = detailRequests.filter((r) => r.status === "paid");
  const detailRejectedRequests = detailRequests.filter((r) => r.status === "rejected");
  const detailEarned = detailHostId ? (earnedByHost.get(detailHostId) ?? 0) : 0;
  const detailPaid = detailHostId ? (paidByHost.get(detailHostId) ?? 0) : 0;
  const detailOpen = detailHostId ? (openByHost.get(detailHostId) ?? 0) : 0;
  const detailAvailable = detailHostId ? availableFor(detailHostId) : 0;

  // Transition a request to a new status. Pending/Processing switch directly;
  // Paid/Part paid/Rejected open a small modal for UTR / amount-sent / reason.
  const transitionTo = (record: PayoutRequest, status: PayoutStatus) => {
    if (status === record.status) return;
    if (status === "pending" || status === "processing") {
      simpleStatusMutation.mutate({ id: record.id, status });
      return;
    }
    if (status === "paid") {
      const payableHeadroom = rawAvailableFor(record.driverUserId) + record.amount;
      if (record.amount > payableHeadroom) {
        message.error(
          `Cannot pay ${formatMoney(record.amount)}. Only ${formatMoney(Math.max(0, payableHeadroom))} is payable after earlier payouts.`,
        );
        return;
      }
    }
    openAction(record, status as "paid" | "rejected" | "part_paid");
  };

  // Compact per-row actions for the requests table: one primary "Mark paid"
  // plus an overflow menu for the rarer transitions / Route / UPI QR. Keeps the
  // row clean; full details live in the row's detail drawer.
  const renderRowActions = (record: PayoutRequest) => {
    const isOpen =
      record.status === "pending" ||
      record.status === "processing" ||
      record.status === "part_paid";
    const items: MenuProps["items"] = [];
    if (record.status !== "processing")
      items.push({ key: "processing", label: "Mark as processing" });
    if (record.status !== "part_paid") items.push({ key: "part_paid", label: "Part paid…" });
    items.push({ key: "deduction", label: "Edit deduction…" });
    if (record.status !== "rejected")
      items.push({ key: "rejected", label: "Reject…", danger: true });
    if (record.status !== "pending") items.push({ key: "pending", label: "Back to pending" });
    if (isOpen && ((ROUTE_ENABLED && !!record.accountNumber) || !!record.upiId))
      items.push({ type: "divider" });
    if (isOpen && ROUTE_ENABLED && !!record.accountNumber)
      items.push({ key: "route", label: "Pay via Route (auto)" });
    if (isOpen && !!record.upiId) items.push({ key: "upiqr", label: "Pay by UPI QR" });

    const onMenu: MenuProps["onClick"] = ({ key, domEvent }) => {
      domEvent.stopPropagation();
      if (key === "route") {
        Modal.confirm({
          title: "Pay via Razorpay Route?",
          content: `Transfer ${formatMoney(payableOf(record) - transferredOf(record))} to ${record.accountHolderName || "the host"}'s bank automatically.`,
          okText: "Pay now",
          onOk: () => routeMutation.mutate({ requestId: record.id }),
        });
        return;
      }
      if (key === "upiqr") return setQrRequest(record);
      if (key === "deduction") return openAction(record, "deduction");
      transitionTo(record, key as PayoutStatus);
    };

    return (
      <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
        {record.status !== "paid" && record.status !== "rejected" && (
          <Button
            size="small"
            type="primary"
            onClick={() => transitionTo(record, "paid")}
            className="rounded-full bg-gradient-primary border-none text-xs font-semibold"
          >
            Mark paid
          </Button>
        )}
        <Dropdown menu={{ items, onClick: onMenu }} trigger={["click"]}>
          <Button
            size="small"
            icon={<MoreHorizontal size={16} />}
            onClick={(e) => e.stopPropagation()}
          />
        </Dropdown>
      </div>
    );
  };

  // Full status chips — used in the detail drawer where there's room.
  const renderStatusChips = (record: PayoutRequest) => {
    const changeTo = (status: PayoutStatus) => transitionTo(record, status);

    return (
      <div className="flex flex-wrap gap-1 max-w-[210px]">
        {ALL_STATUSES.map((status) => {
          const active = record.status === status;
          return (
            <Tag.CheckableTag
              key={status}
              checked={active}
              onChange={() => changeTo(status)}
              onClick={(e) => e.stopPropagation()}
              className={`!m-0 rounded-full border px-2 py-0.5 text-xs ${
                active
                  ? "!bg-primary !text-white border-transparent font-semibold"
                  : "border-gray-200 text-gray-500 hover:border-primary/50 hover:text-primary"
              }`}
            >
              {STATUS_LABELS[status]}
            </Tag.CheckableTag>
          );
        })}
        {record.status === "part_paid" && (
          <Text type="secondary" className="w-full text-xs">
            {formatMoney(record.paidAmount ?? 0)} of {formatMoney(payableOf(record))} sent
          </Text>
        )}
        {ROUTE_ENABLED &&
          (record.status === "pending" ||
            record.status === "processing" ||
            record.status === "part_paid") &&
          !!record.accountNumber && (
            <Popconfirm
              title="Pay via Razorpay Route?"
              description={`Transfer ${formatMoney(
                payableOf(record) - transferredOf(record),
              )} to ${record.accountHolderName || "the host"}'s bank automatically.`}
              okText="Pay now"
              cancelText="Cancel"
              okButtonProps={{ loading: routeMutation.isPending }}
              onConfirm={() => routeMutation.mutate({ requestId: record.id })}
            >
              <Button
                size="small"
                type="primary"
                icon={<Zap size={13} />}
                loading={
                  routeMutation.isPending && routeMutation.variables?.requestId === record.id
                }
                onClick={(e) => e.stopPropagation()}
                className="!m-0 mt-1 rounded-full bg-gradient-primary border-none text-xs font-semibold"
              >
                Pay via Route
              </Button>
            </Popconfirm>
          )}
        {(record.status === "pending" ||
          record.status === "processing" ||
          record.status === "part_paid") &&
          !!record.upiId && (
            <Button
              size="small"
              icon={<QrCode size={13} />}
              onClick={(e) => {
                e.stopPropagation();
                setQrRequest(record);
              }}
              className="!m-0 mt-1 rounded-full border-primary/40 text-primary text-xs font-semibold"
            >
              UPI QR
            </Button>
          )}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-500">
      <div className="flex flex-col gap-1">
        <Title level={2} style={{ margin: 0 }}>
          Payouts
        </Title>
        <Text type="secondary">
          Review payout requests from hosts/drivers and mark them as paid once you've sent the money
          manually.
        </Text>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md">
          <Text type="secondary">Total host earnings</Text>
          <Title level={3} style={{ margin: "4px 0" }} className="!text-emerald-600">
            ₹{totalEarnings.toLocaleString("en-IN")}
          </Title>
        </Card>
        <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md">
          <Text type="secondary">Open requests</Text>
          <Title level={3} style={{ margin: "4px 0" }}>
            {openRequestCount}
          </Title>
        </Card>
        <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md">
          <Text type="secondary">Pending + processing amount</Text>
          <Title level={3} style={{ margin: "4px 0" }}>
            ₹{totalPending.toLocaleString("en-IN")}
          </Title>
        </Card>
        <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md">
          <Text type="secondary">Total paid out</Text>
          <Title level={3} style={{ margin: "4px 0" }}>
            ₹{totalPaid.toLocaleString("en-IN")}
          </Title>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md">
          <Text type="secondary">Platform commission — open ({PLATFORM_FEE_PERCENT}%)</Text>
          <Title level={3} style={{ margin: "4px 0" }} className="!text-amber-600">
            ₹{totalCommissionOpen.toLocaleString("en-IN")}
          </Title>
          <Text type="secondary" className="text-xs">
            Across pending/processing requests
          </Text>
        </Card>
        <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md">
          <Text type="secondary">Platform commission — realized ({PLATFORM_FEE_PERCENT}%)</Text>
          <Title level={3} style={{ margin: "4px 0" }} className="!text-amber-600">
            ₹{totalCommissionPaid.toLocaleString("en-IN")}
          </Title>
          <Text type="secondary" className="text-xs">
            Across paid payouts. Compare against Overview → Platform earnings, which counts every
            completed-trip booking (incl. earnings not yet withdrawn).
          </Text>
        </Card>
      </div>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <div className="p-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <Text strong>Payout requests</Text>
            <div className="text-xs text-muted-foreground">
              Host requests and admin-recorded payments in one ledger. Tap a status chip to update a
              row.
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onChange={setStatusFilter}
              style={{ width: 170 }}
              options={[
                { value: "all", label: "All payments" },
                ...ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] })),
              ]}
            />
            <Button
              icon={<Download size={14} />}
              onClick={() =>
                downloadCsv(
                  `coolpool-payouts-${new Date().toISOString().slice(0, 10)}`,
                  [
                    { header: "Host", value: (r) => driverNameByUserId.get(r.driverUserId) ?? r.driverUserId },
                    { header: "Amount", value: (r) => r.amount },
                    { header: "Deduction", value: (r) => r.deduction ?? 0 },
                    { header: "Payable", value: (r) => payableOf(r) },
                    { header: "Paid", value: (r) => transferredOf(r) },
                    { header: "Status", value: (r) => r.status },
                    { header: "Reference", value: (r) => r.paymentReference ?? "" },
                    { header: "Account", value: (r) => r.accountNumber ?? "" },
                    { header: "IFSC", value: (r) => r.ifscCode ?? "" },
                    { header: "UPI", value: (r) => r.upiId ?? "" },
                    { header: "Processed at", value: (r) => r.processedAt ?? "" },
                  ],
                  filteredRequests,
                )
              }
            >
              Export
            </Button>
            <Button
              type="primary"
              icon={<Plus size={14} />}
              onClick={() => {
                addForm.resetFields();
                setAddOpen(true);
              }}
            >
              Add payment
            </Button>
          </div>
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="id"
          loading={requestsLoading || driversLoading}
          dataSource={filteredRequests}
          locale={{ emptyText: "No payout requests yet." }}
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({
            onClick: () => openDetails(record),
            className: "cursor-pointer",
          })}
          columns={[
            {
              title: "Recorded",
              dataIndex: "requestedAt",
              key: "requestedAt",
              render: (date: string, r) => (
                <div className="text-sm">
                  <div>{formatDateTime(date)}</div>
                  <Tag
                    bordered={false}
                    className="mt-1 text-[10px] uppercase tracking-wide"
                    color={r.entrySource === "admin" ? "geekblue" : "default"}
                  >
                    {r.entrySource === "admin" ? "Added by admin" : "Requested by host"}
                  </Tag>
                </div>
              ),
            },
            {
              title: "Host",
              key: "driver",
              render: (_, r) => {
                const earned = earnedByHost.get(r.driverUserId) ?? 0;
                const rawAvailable = rawAvailableFor(r.driverUserId);
                const headroom =
                  rawAvailable +
                  (r.status === "pending" || r.status === "processing" ? r.amount : 0);
                const ok = r.amount <= headroom;
                return (
                  <div>
                    <Text strong>{driverNameByUserId.get(r.driverUserId) || "Unknown"}</Text>
                    <div className="text-xs text-muted-foreground">
                      Earned ₹{earned.toLocaleString("en-IN")}
                    </div>
                    {(r.status === "pending" || r.status === "processing") && (
                      <div
                        className={`text-xs font-semibold ${ok ? "text-emerald-600" : "text-rose-600"}`}
                      >
                        {ok
                          ? `✓ ₹${r.amount} of ₹${headroom.toLocaleString("en-IN")} available`
                          : `⚠ ₹${r.amount} > ₹${Math.max(0, headroom).toLocaleString("en-IN")} payable`}
                      </div>
                    )}
                  </div>
                );
              },
            },
            {
              title: "Trip",
              key: "trip",
              render: (_, r) =>
                tripCodeFor(r.tripId) ? (
                  <div className="text-sm">
                    <Text className="font-mono text-sm">{tripCodeFor(r.tripId)}</Text>
                    {r.tripRoute && (
                      <div className="text-xs text-muted-foreground">{r.tripRoute}</div>
                    )}
                  </div>
                ) : (
                  <Text type="secondary">—</Text>
                ),
            },
            {
              title: "Payable",
              key: "payable",
              render: (_, r) => (
                <div>
                  <Text strong className="!text-emerald-600">
                    {formatMoney(payableOf(r))}
                  </Text>
                  {(r.deduction ?? 0) > 0 && (
                    <div className="text-[10px] text-rose-500">
                      −{formatMoney(r.deduction ?? 0)} deducted
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: "Status",
              key: "status",
              render: (_, r) => (
                <div>
                  <Tag color={STATUS_COLORS[r.status]} bordered={false} className="rounded-full">
                    {STATUS_LABELS[r.status]}
                  </Tag>
                  {r.status === "part_paid" && (
                    <div className="text-[10px] text-muted-foreground">
                      {formatMoney(r.paidAmount ?? 0)} of {formatMoney(payableOf(r))} sent
                    </div>
                  )}
                </div>
              ),
            },
            {
              title: "Actions",
              key: "actions",
              render: (_, r) => renderRowActions(r),
            },
          ]}
        />
      </Card>

      <Card className="rounded-3xl border-none shadow-card bg-white/90 backdrop-blur-md p-2 overflow-hidden">
        <div className="p-4">
          <Text strong>Earnings by host</Text>
          <div className="text-xs text-muted-foreground">
            Net earnings from completed trips, what's been paid, and what's available to withdraw.
          </div>
        </div>
        <Table
          scroll={{ x: "max-content" }}
          rowKey="userId"
          loading={requestsLoading || driversLoading}
          dataSource={ledger}
          locale={{ emptyText: "No host earnings yet." }}
          pagination={{ pageSize: 10 }}
          onRow={(record) => ({
            onClick: () => {
              setDetailHostId(record.userId);
              setDetailRequestId(null);
            },
            className: "cursor-pointer",
          })}
          columns={[
            {
              title: "Host",
              dataIndex: "name",
              key: "name",
              render: (v: string) => <Text strong>{v}</Text>,
            },
            { title: "Earned (net)", key: "earned", render: (_, r) => formatMoney(r.earned) },
            { title: "Paid out", key: "paid", render: (_, r) => formatMoney(r.paid) },
            { title: "Pending", key: "pending", render: (_, r) => formatMoney(r.pending) },
            {
              title: "Commission generated",
              key: "commission",
              render: (_, r) => <Text type="secondary">{formatMoney(r.commission)}</Text>,
            },
            {
              title: "Available",
              key: "available",
              render: (_, r) => (
                <Text strong className="!text-emerald-600">
                  {formatMoney(r.available)}
                </Text>
              ),
            },
          ]}
        />
      </Card>

      <Drawer
        open={!!detailHostId}
        width={620}
        title={
          <div className="flex items-center gap-2">
            <WalletCards size={18} />
            <span>{detailHostName} payout details</span>
          </div>
        }
        onClose={() => {
          setDetailHostId(null);
          setDetailRequestId(null);
        }}
      >
        {detailHostId && (
          <div className="space-y-5">
            <div className="grid grid-cols-2 gap-3">
              {[
                ["Earned", detailEarned],
                ["Open", detailOpen],
                ["Paid", detailPaid],
                ["Available", detailAvailable],
              ].map(([label, value]) => (
                <div key={String(label)} className="rounded-2xl bg-slate-50 p-4">
                  <div className="text-xs text-muted-foreground">{label}</div>
                  <div className="text-xl font-bold">{formatMoney(Number(value))}</div>
                </div>
              ))}
            </div>

            {detailRequest && (
              <section className="rounded-3xl border border-border p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <Text strong>Selected request</Text>
                    <div className="text-xs text-muted-foreground">
                      Requested {formatDateTime(detailRequest.requestedAt)}
                    </div>
                  </div>
                  <Tag color={STATUS_COLORS[detailRequest.status]} bordered={false}>
                    {STATUS_LABELS[detailRequest.status]}
                  </Tag>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {(detailRequest.tripRoute || detailRequest.tripId) && (
                    <div className="sm:col-span-2">
                      <div className="text-xs text-muted-foreground">Trip</div>
                      {detailRequest.tripRoute && (
                        <div className="font-bold">{detailRequest.tripRoute}</div>
                      )}
                      <div className="text-xs text-muted-foreground">
                        {detailRequest.tripDate &&
                          `${new Date(detailRequest.tripDate).toLocaleDateString("en-IN", {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}`}
                        {detailRequest.tripDate && tripCodeFor(detailRequest.tripId) ? " · " : ""}
                        {tripCodeFor(detailRequest.tripId) && (
                          <span className="font-mono">{tripCodeFor(detailRequest.tripId)}</span>
                        )}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-xs text-muted-foreground">Amount (net to host)</div>
                    <div className="font-bold">{formatMoney(detailRequest.amount)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Deduction</div>
                    <div className={`font-semibold ${detailRequest.deduction ? "text-rose-600" : ""}`}>
                      {formatMoney(detailRequest.deduction ?? 0)}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Payable</div>
                    <div className="font-bold text-emerald-600">
                      {formatMoney(payableOf(detailRequest))}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">
                      Platform commission ({PLATFORM_FEE_PERCENT}%)
                    </div>
                    <div className="font-semibold">
                      <CommissionCell request={detailRequest} />
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Gross amount</div>
                    <div className="font-semibold">
                      {detailRequest.grossAmount != null
                        ? formatMoney(detailRequest.grossAmount)
                        : `≈${formatMoney(detailRequest.amount + feeFor(detailRequest).fee)}`}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Processed</div>
                    <div className="font-semibold">{formatDateTime(detailRequest.processedAt)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Account holder</div>
                    <div className="font-semibold">{detailRequest.accountHolderName || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Account number</div>
                    <div className="font-semibold">{detailRequest.accountNumber || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">IFSC</div>
                    <div className="font-semibold">{detailRequest.ifscCode || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">UPI ID</div>
                    <div className="font-semibold">{detailRequest.upiId || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Payment reference</div>
                    <div className="font-semibold">{detailRequest.paymentReference || "—"}</div>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Admin note</div>
                    <div className="font-semibold">{detailRequest.adminNote || "—"}</div>
                  </div>
                </div>
                <div className="mt-4">{renderStatusChips(detailRequest)}</div>
              </section>
            )}

            <section className="space-y-3">
              <div>
                <Text strong>Pending payments</Text>
                <div className="text-xs text-muted-foreground">
                  Requests waiting for processing or manual transfer.
                </div>
              </div>
              {detailOpenRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No pending payouts for this host.
                </div>
              ) : (
                detailOpenRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-primary/60"
                    onClick={() => setDetailRequestId(request.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{formatMoney(request.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDateTime(request.requestedAt)}
                        </div>
                        <div className="mt-2 text-sm text-muted-foreground">
                          {request.accountHolderName} · {request.accountNumber || "No account"} ·{" "}
                          {request.ifscCode || "No IFSC"}
                        </div>
                        {request.upiId && (
                          <div className="text-sm text-muted-foreground">UPI: {request.upiId}</div>
                        )}
                      </div>
                      <Tag color={STATUS_COLORS[request.status]} bordered={false}>
                        {STATUS_LABELS[request.status]}
                        {request.status === "part_paid" &&
                          ` · ${formatMoney(request.paidAmount ?? 0)} sent`}
                      </Tag>
                    </div>
                  </button>
                ))
              )}
            </section>

            <section className="space-y-3">
              <div>
                <Text strong>Paid history</Text>
                <div className="text-xs text-muted-foreground">
                  Completed manual transfers and their references.
                </div>
              </div>
              {detailPaidRequests.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-border p-4 text-sm text-muted-foreground">
                  No paid payout history yet.
                </div>
              ) : (
                detailPaidRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-primary/60"
                    onClick={() => setDetailRequestId(request.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{formatMoney(request.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          Requested {formatDateTime(request.requestedAt)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Paid {formatDateTime(request.processedAt)}
                        </div>
                        <div className="mt-2 text-sm">
                          Ref:{" "}
                          <span className="font-semibold">{request.paymentReference || "—"}</span>
                        </div>
                        {request.adminNote && (
                          <div className="text-sm text-muted-foreground">
                            Note: {request.adminNote}
                          </div>
                        )}
                      </div>
                      <Tag color="success" bordered={false}>
                        Paid
                      </Tag>
                    </div>
                  </button>
                ))
              )}
            </section>

            {detailRejectedRequests.length > 0 && (
              <section className="space-y-3">
                <Text strong>Rejected history</Text>
                {detailRejectedRequests.map((request) => (
                  <button
                    key={request.id}
                    type="button"
                    className="w-full rounded-2xl border border-border bg-white p-4 text-left transition hover:border-primary/60"
                    onClick={() => setDetailRequestId(request.id)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">{formatMoney(request.amount)}</div>
                        <div className="text-xs text-muted-foreground">
                          Rejected {formatDateTime(request.processedAt)}
                        </div>
                        {request.adminNote && (
                          <div className="mt-2 text-sm text-muted-foreground">
                            Note: {request.adminNote}
                          </div>
                        )}
                      </div>
                      <Tag color="error" bordered={false}>
                        Rejected
                      </Tag>
                    </div>
                  </button>
                ))}
              </section>
            )}
          </div>
        )}
      </Drawer>

      <Modal
        open={!!actionRequest}
        title={
          actionType === "paid"
            ? "Mark payout as paid"
            : actionType === "part_paid"
              ? "Record a part payment"
              : actionType === "deduction"
                ? "Edit deduction (fine)"
                : "Reject payout request"
        }
        onCancel={() => {
          setActionRequest(null);
          setActionType(null);
        }}
        footer={null}
        destroyOnClose
      >
        {actionRequest && (
          <div className="mt-2 rounded-xl bg-slate-50 p-3 text-sm">
            {driverNameByUserId.get(actionRequest.driverUserId) || "Unknown"} ·{" "}
            {formatMoney(actionRequest.amount)} total
            {(actionRequest.deduction ?? 0) > 0 &&
              ` · ${formatMoney(actionRequest.deduction ?? 0)} deduction`}{" "}
            · payable {formatMoney(payableOf(actionRequest))}
          </div>
        )}
        <Form form={form} layout="vertical" onFinish={submitAction} className="mt-4">
          {(actionType === "paid" || actionType === "part_paid") && (
            <Form.Item
              label="Transaction ID (UTR no)"
              name="paymentReference"
              rules={[{ required: true, message: "Enter the transfer reference number" }]}
            >
              <Input placeholder="e.g. SBIN426190882312" />
            </Form.Item>
          )}
          {actionType === "part_paid" && (
            <Form.Item
              label="Amount sent so far"
              name="paidAmount"
              rules={[{ required: true, message: "Enter how much has been transferred" }]}
            >
              <InputNumber min={1} prefix="₹" style={{ width: "100%" }} />
            </Form.Item>
          )}
          {actionType === "deduction" && (
            <Form.Item
              label="Deduction amount (fine)"
              name="deduction"
              rules={[{ required: true, message: "Enter the deduction (0 to clear it)" }]}
            >
              <InputNumber min={0} prefix="₹" style={{ width: "100%" }} />
            </Form.Item>
          )}
          <Form.Item
            label={
              actionType === "rejected"
                ? "Reason (shown to the host)"
                : actionType === "deduction"
                  ? "Reason for the deduction (shown to the host)"
                  : "Note (optional)"
            }
            name="adminNote"
            rules={
              actionType === "rejected" || actionType === "deduction"
                ? [{ required: true, message: "A reason is required" }]
                : []
            }
          >
            <Input.TextArea
              rows={3}
              placeholder={
                actionType === "rejected"
                  ? "Why this payout is being rejected"
                  : actionType === "deduction"
                    ? "e.g. Late-start fine for trip 2606-CPTR-0006"
                    : "Any internal notes…"
              }
            />
          </Form.Item>
          <Button
            type="primary"
            danger={actionType === "rejected"}
            htmlType="submit"
            loading={updateMutation.isPending}
            block
          >
            {actionType === "paid"
              ? "Confirm Paid"
              : actionType === "part_paid"
                ? "Save part payment"
                : actionType === "deduction"
                  ? "Save deduction"
                  : "Confirm Reject"}
          </Button>
        </Form>
      </Modal>

      <Modal
        open={addOpen}
        title="Add payment"
        onCancel={() => setAddOpen(false)}
        footer={null}
        destroyOnClose
      >
        <Form
          form={addForm}
          layout="vertical"
          className="mt-4"
          initialValues={{ status: "paid", deduction: 0 }}
          onFinish={(values) =>
            addMutation.mutate({
              driverUserId: values.driverUserId,
              amount: values.amount,
              tripId: values.tripId || null,
              deduction: values.deduction ?? 0,
              status: values.status,
              paymentReference: values.paymentReference,
              adminNote: values.adminNote,
              paidAmount: values.paidAmount,
            })
          }
        >
          <Form.Item
            label="Host"
            name="driverUserId"
            rules={[{ required: true, message: "Pick the host you paid" }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              placeholder="Select host"
              options={drivers.map((d) => ({
                value: d.userId,
                label: `${d.fullName} — owed ${formatMoney(availableFor(d.userId))}`,
              }))}
            />
          </Form.Item>
          <Form.Item label="Trip (optional)" name="tripId">
            <Select
              allowClear
              showSearch
              optionFilterProp="label"
              placeholder="No specific trip"
              options={trips
                .filter((t) => t.hostId === addHostId && t.status === "completed")
                .map((t) => ({
                  value: t.id,
                  label: `${t.tripCode ?? `#${t.id.slice(-6).toUpperCase()}`} · ${t.fromLocation.split(",")[0]} → ${t.toLocation.split(",")[0]}`,
                }))}
            />
          </Form.Item>
          <div className="grid grid-cols-2 gap-3">
            <Form.Item
              label="Total amount"
              name="amount"
              rules={[{ required: true, message: "Enter the amount" }]}
            >
              <InputNumber min={1} prefix="₹" style={{ width: "100%" }} />
            </Form.Item>
            <Form.Item label="Deduction (fine)" name="deduction">
              <InputNumber min={0} prefix="₹" style={{ width: "100%" }} />
            </Form.Item>
          </div>
          <Form.Item label="Status" name="status" rules={[{ required: true }]}>
            <Select options={ALL_STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s] }))} />
          </Form.Item>
          {addStatus === "part_paid" && (
            <Form.Item
              label="Amount sent so far"
              name="paidAmount"
              rules={[{ required: true, message: "Enter how much has been transferred" }]}
            >
              <InputNumber min={1} prefix="₹" style={{ width: "100%" }} />
            </Form.Item>
          )}
          {(addStatus === "paid" || addStatus === "part_paid") && (
            <Form.Item
              label="Transaction ID (UTR no)"
              name="paymentReference"
              rules={[{ required: true, message: "Enter the transfer reference number" }]}
            >
              <Input placeholder="e.g. SBIN426190882312" />
            </Form.Item>
          )}
          <Form.Item label="Note (required if deduction)" name="adminNote">
            <Input.TextArea rows={2} placeholder="e.g. reason for a fine, or internal notes" />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={addMutation.isPending} block>
            Record payment
          </Button>
        </Form>
      </Modal>

      {/* Pay a host by UPI — turns their saved UPI ID into a QR pre-filled with
          the exact payable amount. Admin scans it with any UPI app, pays, then
          marks the row Paid (with the UPI reference). */}
      <Modal
        open={!!qrRequest}
        title="Pay host via UPI"
        onCancel={() => setQrRequest(null)}
        footer={null}
        destroyOnClose
      >
        {qrRequest &&
          (() => {
            const amt = Math.max(0, payableOf(qrRequest) - transferredOf(qrRequest));
            const name = qrRequest.accountHolderName || "Coolpool Host";
            const link =
              `upi://pay?pa=${encodeURIComponent(qrRequest.upiId ?? "")}` +
              `&pn=${encodeURIComponent(name)}` +
              `&am=${amt.toFixed(2)}&cu=INR` +
              `&tn=${encodeURIComponent(`Coolpool payout ${qrRequest.id.slice(-6)}`)}`;
            return (
              <div className="mt-2 text-center">
                <p className="text-sm text-muted-foreground">Paying</p>
                <p className="text-lg font-bold">{name}</p>
                <p className="mt-1 text-3xl font-black text-primary">{formatMoney(amt)}</p>
                <div className="my-5 flex justify-center">
                  <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
                    <QRCodeSVG value={link} size={208} level="M" marginSize={2} />
                  </div>
                </div>
                <p className="text-sm">
                  Scan with any UPI app (GPay / PhonePe / Paytm) — the amount is pre-filled.
                </p>
                <p className="mt-1 font-mono text-xs text-muted-foreground">
                  UPI: {qrRequest.upiId}
                </p>
                <div className="mt-5 flex gap-2">
                  <Button block onClick={() => setQrRequest(null)}>
                    Close
                  </Button>
                  <Button
                    type="primary"
                    block
                    onClick={() => {
                      const r = qrRequest;
                      setQrRequest(null);
                      openAction(r, "paid");
                    }}
                  >
                    I've paid — mark Paid
                  </Button>
                </div>
              </div>
            );
          })()}
      </Modal>
    </div>
  );
}
