import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, Typography, Form, Input, Button, Tag, message, Spin, Modal } from "antd";
import {
  Wallet,
  History as HistoryIcon,
  Pencil,
  ArrowRight,
  CheckCircle2,
  Clock3,
  XCircle,
  MapPin,
  ShieldCheck,
  ShieldAlert,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  getBankAccount,
  upsertBankAccount,
  listPayoutRequestsByDriver,
  createPayoutRequest,
  listHostTrips,
  listHostBookings,
} from "@/data/appwrite-repository";
import { verifyBankAccountServer } from "@/integrations/kyc/bank-verify";
import { account } from "@/integrations/appwrite/client";
import {
  hostNetEarnings,
  platformFee,
  PLATFORM_FEE_PERCENT,
  estimateFeeFromNet,
} from "@/lib/pricing";
import type { PayoutStatus, Trip } from "@/lib/domain";

const { Title, Text } = Typography;

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

interface BankAccountFormValues {
  accountHolderName: string;
  accountNumber: string;
  confirmAccountNumber: string;
  ifscCode: string;
  upiId?: string;
}

function tripShortId(tripId: string) {
  return `#${tripId.slice(-6).toUpperCase()}`;
}

function tripRouteLabel(trip: Trip) {
  const from = trip.fromLocation.split(",")[0].trim();
  const to = trip.toLocation.split(",")[0].trim();
  return `${from} → ${to}`;
}

interface TripEarningsCardProps {
  trip: Trip;
  collected: number;
  fee: number;
  net: number;
  payoutStatus: PayoutStatus | null;
  hasBankAccount: boolean;
  availableBalance: number;
  onWithdraw: () => void;
  onAddBank: () => void;
}

function TripEarningsCard({
  trip,
  collected,
  fee,
  net,
  payoutStatus,
  hasBankAccount,
  availableBalance,
  onWithdraw,
  onAddBank,
}: TripEarningsCardProps) {
  const dateLabel = new Date(trip.departureAt).toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
  const route = tripRouteLabel(trip);

  const canWithdraw = hasBankAccount && payoutStatus === null && availableBalance >= net;

  let actionButton: React.ReactNode;
  if (!hasBankAccount) {
    actionButton = (
      <Button
        block
        size="large"
        className="rounded-2xl h-14 font-bold text-base border-2 border-purple-300 text-purple-600"
        onClick={onAddBank}
      >
        Add Bank First
      </Button>
    );
  } else if (payoutStatus === null) {
    actionButton = (
      <Button
        type="primary"
        block
        size="large"
        disabled={!canWithdraw}
        className="rounded-2xl h-14 font-bold text-base bg-gradient-primary border-none shadow-glow"
        onClick={onWithdraw}
        icon={<ArrowRight size={18} />}
        iconPosition="end"
      >
        Withdraw ₹{net.toLocaleString("en-IN")}
      </Button>
    );
  } else if (payoutStatus === "pending" || payoutStatus === "processing") {
    actionButton = (
      <Button
        block
        size="large"
        disabled
        className="rounded-2xl h-14 font-bold text-base"
        icon={<Clock3 size={18} />}
        iconPosition="end"
      >
        {payoutStatus === "processing" ? "Processing" : "Requested"}
      </Button>
    );
  } else if (payoutStatus === "paid") {
    actionButton = (
      <Button
        block
        size="large"
        disabled
        className="rounded-2xl h-14 font-bold text-base !text-emerald-600 !border-emerald-200 !bg-emerald-50"
        icon={<CheckCircle2 size={18} />}
        iconPosition="end"
      >
        Paid
      </Button>
    );
  } else if (payoutStatus === "rejected") {
    actionButton = (
      <Button
        type="primary"
        block
        size="large"
        className="rounded-2xl h-14 font-bold text-base bg-gradient-primary border-none shadow-glow"
        onClick={onWithdraw}
        icon={<ArrowRight size={18} />}
        iconPosition="end"
      >
        Retry ₹{net.toLocaleString("en-IN")}
      </Button>
    );
  }

  return (
    <Card className="rounded-3xl border-none shadow-soft bg-white/90 overflow-hidden">
      {/* Trip header */}
      <div className="flex items-start justify-between gap-2 mb-5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-2xl bg-purple-100 flex items-center justify-center shrink-0 mt-0.5">
            <MapPin size={18} className="text-purple-600" />
          </div>
          <div>
            <div className="text-lg font-extrabold leading-tight">{route}</div>
            <div className="text-sm text-muted-foreground mt-0.5">
              {dateLabel} · {tripShortId(trip.id)}
            </div>
          </div>
        </div>
        {payoutStatus && (
          <Tag
            color={STATUS_COLORS[payoutStatus]}
            bordered={false}
            className="text-sm shrink-0 mt-1"
          >
            {STATUS_LABELS[payoutStatus]}
          </Tag>
        )}
      </div>

      {/* Earnings breakdown — 3 columns */}
      <div className="grid grid-cols-3 gap-3 mb-5">
        <div className="rounded-2xl bg-slate-50 p-3 text-center">
          <div className="text-xs text-muted-foreground font-semibold mb-1">Collected</div>
          <div className="text-lg font-extrabold">₹{collected.toLocaleString("en-IN")}</div>
        </div>
        <div className="rounded-2xl bg-amber-50 p-3 text-center">
          <div className="text-xs text-amber-600 font-semibold mb-1">
            Fee ({PLATFORM_FEE_PERCENT}%)
          </div>
          <div className="text-lg font-extrabold text-amber-600">
            ₹{fee.toLocaleString("en-IN")}
          </div>
        </div>
        <div className="rounded-2xl bg-emerald-50 p-3 text-center">
          <div className="text-xs text-emerald-600 font-semibold mb-1">Net</div>
          <div className="text-lg font-extrabold text-emerald-600">
            ₹{net.toLocaleString("en-IN")}
          </div>
        </div>
      </div>

      {actionButton}
    </Card>
  );
}

export function PayoutsPanel() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.$id;
  const [bankForm] = Form.useForm<BankAccountFormValues>();
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankVerify, setBankVerify] = useState<
    | { status: "idle" }
    | { status: "checking" }
    | {
        status: "done";
        exists: boolean;
        nameAtBank: string | null;
        nameMatch: boolean | null;
      }
    | { status: "error"; message: string }
  >({ status: "idle" });
  const [withdrawTrip, setWithdrawTrip] = useState<{
    trip: Trip;
    net: number;
    grossAmount: number;
  } | null>(null);

  const { data: bankAccount, isLoading: bankLoading } = useQuery({
    queryKey: ["bank-account", userId],
    queryFn: () => (userId ? getBankAccount(userId) : Promise.resolve(null)),
    enabled: !!userId,
  });

  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["host-trips", userId],
    queryFn: () => (userId ? listHostTrips(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const { data: bookings = [], isLoading: bookingsLoading } = useQuery({
    queryKey: ["host-bookings", userId],
    queryFn: () => (userId ? listHostBookings(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  const { data: payoutRequests = [], isLoading: requestsLoading } = useQuery({
    queryKey: ["payout-requests", userId],
    queryFn: () => (userId ? listPayoutRequestsByDriver(userId) : Promise.resolve([])),
    enabled: !!userId,
  });

  useEffect(() => {
    if (bankAccount) {
      bankForm.setFieldsValue({
        accountHolderName: bankAccount.accountHolderName,
        accountNumber: bankAccount.accountNumber,
        confirmAccountNumber: bankAccount.accountNumber,
        ifscCode: bankAccount.ifscCode,
        upiId: bankAccount.upiId ?? undefined,
      });
    }
  }, [bankAccount, bankForm]);

  const saveBankMutation = useMutation({
    mutationFn: (values: BankAccountFormValues) => {
      if (!userId) throw new Error("Not logged in");
      return upsertBankAccount({
        driverUserId: userId,
        accountHolderName: values.accountHolderName,
        accountNumber: values.accountNumber,
        ifscCode: values.ifscCode.toUpperCase(),
        upiId: values.upiId || null,
      });
    },
    onSuccess: () => {
      message.success("Bank details saved.");
      void queryClient.invalidateQueries({ queryKey: ["bank-account", userId] });
      setBankModalOpen(false);
    },
    onError: (error: any) => message.error(error.message || "Failed to save bank details."),
  });

  // Penny-less verification: confirm the account exists and the holder name
  // matches, before we ever pay into it. Best-effort — if the provider isn't
  // configured yet, we simply skip (the host can still save and withdraw).
  const runBankVerify = async () => {
    const holder = (bankForm.getFieldValue("accountHolderName") || "").trim();
    const account = (bankForm.getFieldValue("accountNumber") || "").trim();
    const ifsc = (bankForm.getFieldValue("ifscCode") || "").trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      message.error("Enter a valid IFSC code first (e.g. HDFC0001234).");
      return;
    }
    if (!account) {
      message.error("Enter the account number first.");
      return;
    }
    setBankVerify({ status: "checking" });
    try {
      const res = await verifyBankAccountServer({
        data: { ifsc, accountNumber: account, name: holder || undefined },
      });
      if (!res.configured) {
        setBankVerify({ status: "idle" });
        message.info("Instant bank verification isn't switched on yet — you can still save.");
        return;
      }
      if (!res.accountExists) {
        setBankVerify({
          status: "done",
          exists: false,
          nameAtBank: res.nameAtBank,
          nameMatch: res.nameMatch,
        });
        return;
      }
      // Account exists — offer to adopt the bank's official spelling of the name.
      if (res.nameAtBank && res.nameMatch !== false) {
        bankForm.setFieldsValue({ accountHolderName: res.nameAtBank });
      }
      // Record the result on the user's profile so it shows on the admin KYC board.
      try {
        await account.updatePrefs({
          ...(user?.prefs || {}),
          bankVerified: true,
          bankName: res.nameAtBank || holder || null,
          bankVerifiedAt: new Date().toISOString(),
        });
      } catch {
        /* best-effort — verification still succeeded */
      }
      setBankVerify({
        status: "done",
        exists: true,
        nameAtBank: res.nameAtBank,
        nameMatch: res.nameMatch,
      });
    } catch (error: any) {
      setBankVerify({
        status: "error",
        message: error?.message || "Couldn't verify the account. Try again.",
      });
    }
  };

  const requestPayoutMutation = useMutation({
    mutationFn: ({ trip, net, grossAmount }: { trip: Trip; net: number; grossAmount: number }) => {
      if (!userId || !bankAccount) throw new Error("Add your bank details first.");
      return createPayoutRequest({
        driverUserId: userId,
        amount: net,
        grossAmount,
        bankAccount,
        tripId: trip.id,
        tripRoute: tripRouteLabel(trip),
        tripDate: trip.departureAt,
      });
    },
    onSuccess: () => {
      message.success("Withdrawal requested. We'll process it soon.");
      void queryClient.invalidateQueries({ queryKey: ["payout-requests", userId] });
      setWithdrawTrip(null);
    },
    onError: (error: any) => message.error(error.message || "Failed to request payout."),
  });

  // Lifetime stats (all completed trips)
  const earnings = useMemo(() => {
    const completedTripIds = new Set(
      trips.filter((t) => t.status === "completed").map((t) => t.id),
    );
    const relevantBookings = bookings.filter(
      (b) => completedTripIds.has(b.tripId) && b.status !== "cancelled",
    );
    const gross = relevantBookings.reduce((sum, b) => sum + b.segmentPrice * b.seatsBooked, 0);
    const lifetime = hostNetEarnings(gross);
    const lifetimeCommission = Math.max(0, gross - lifetime);

    // Paid rows settle amount − deduction; part-paid rows count what's been
    // sent so far, with the remainder staying in "pending".
    const paidOut = payoutRequests.reduce((sum, r) => {
      const payable = Math.max(0, r.amount - (r.deduction ?? 0));
      if (r.status === "paid") return sum + payable;
      if (r.status === "part_paid") return sum + Math.min(r.paidAmount ?? 0, payable);
      return sum;
    }, 0);
    const pending = payoutRequests.reduce((sum, r) => {
      const payable = Math.max(0, r.amount - (r.deduction ?? 0));
      if (r.status === "pending" || r.status === "processing") return sum + payable;
      if (r.status === "part_paid")
        return sum + Math.max(0, payable - Math.min(r.paidAmount ?? 0, payable));
      return sum;
    }, 0);
    const available = Math.max(0, lifetime - paidOut - pending);

    return { lifetime, lifetimeCommission, paidOut, pending, available };
  }, [trips, bookings, payoutRequests]);

  // Per-trip earnings for completed trips
  const perTripItems = useMemo(() => {
    const completedTrips = trips.filter((t) => t.status === "completed");
    return completedTrips
      .map((trip) => {
        const tripBookings = bookings.filter(
          (b) => b.tripId === trip.id && b.status !== "cancelled",
        );
        const collected = tripBookings.reduce((sum, b) => sum + b.segmentPrice * b.seatsBooked, 0);
        if (collected === 0) return null;
        const fee = platformFee(collected);
        const net = hostNetEarnings(collected);
        // Find the most recent payout request for this trip
        const tripRequests = payoutRequests
          .filter((r) => r.tripId === trip.id)
          .sort((a, b) => new Date(b.requestedAt).getTime() - new Date(a.requestedAt).getTime());
        const latestRequest = tripRequests[0] ?? null;
        const payoutStatus = latestRequest
          ? latestRequest.status === "rejected"
            ? null // rejected = can retry
            : latestRequest.status
          : null;
        return { trip, collected, fee, net, payoutStatus, latestRequest };
      })
      .filter(Boolean)
      .sort(
        (a, b) => new Date(b!.trip.departureAt).getTime() - new Date(a!.trip.departureAt).getTime(),
      ) as Array<{
      trip: Trip;
      collected: number;
      fee: number;
      net: number;
      payoutStatus: PayoutStatus | null;
      latestRequest: (typeof payoutRequests)[number] | null;
    }>;
  }, [trips, bookings, payoutRequests]);

  // Legacy bulk requests (no tripId) shown in History
  const legacyRequests = useMemo(() => payoutRequests.filter((r) => !r.tripId), [payoutRequests]);

  const loading = bankLoading || tripsLoading || bookingsLoading || requestsLoading;

  if (!userId) return null;

  return (
    <div className="space-y-7 sm:space-y-8 animate-in fade-in slide-in-from-right-4 duration-500">
      {/* Page title */}
      <div className="flex flex-col gap-1">
        <Title level={1} className="!text-3xl sm:!text-4xl !font-extrabold" style={{ margin: 0 }}>
          Payouts
        </Title>
        <Text type="secondary" className="text-base">
          Net of {PLATFORM_FEE_PERCENT}% platform fee. Request withdrawal per trip after it's
          completed.
        </Text>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        <Card className="rounded-2xl border-none shadow-soft bg-white/80">
          <Text type="secondary" className="text-sm font-semibold">
            Lifetime
          </Text>
          <Title level={2} className="!text-3xl !font-extrabold" style={{ margin: "4px 0" }}>
            {loading ? <Spin size="small" /> : `₹${earnings.lifetime.toLocaleString("en-IN")}`}
          </Title>
        </Card>
        <Card className="rounded-2xl border-none shadow-soft bg-white/80">
          <Text type="secondary" className="text-sm font-semibold">
            Commission ({PLATFORM_FEE_PERCENT}%)
          </Text>
          <Title
            level={2}
            className="!text-3xl !font-extrabold !text-amber-600"
            style={{ margin: "4px 0" }}
          >
            {loading ? (
              <Spin size="small" />
            ) : (
              `₹${earnings.lifetimeCommission.toLocaleString("en-IN")}`
            )}
          </Title>
        </Card>
        <Card className="rounded-2xl border-none shadow-soft bg-white/80">
          <Text type="secondary" className="text-sm font-semibold">
            Available
          </Text>
          <Title
            level={2}
            className="!text-3xl !font-extrabold !text-emerald-600"
            style={{ margin: "4px 0" }}
          >
            {loading ? <Spin size="small" /> : `₹${earnings.available.toLocaleString("en-IN")}`}
          </Title>
        </Card>
        <Card className="rounded-2xl border-none shadow-soft bg-white/80">
          <Text type="secondary" className="text-sm font-semibold">
            Pending
          </Text>
          <Title level={2} className="!text-3xl !font-extrabold" style={{ margin: "4px 0" }}>
            {loading ? <Spin size="small" /> : `₹${earnings.pending.toLocaleString("en-IN")}`}
          </Title>
        </Card>
        <Card className="rounded-2xl border-none shadow-soft bg-white/80">
          <Text type="secondary" className="text-sm font-semibold">
            Paid out
          </Text>
          <Title level={2} className="!text-3xl !font-extrabold" style={{ margin: "4px 0" }}>
            {loading ? <Spin size="small" /> : `₹${earnings.paidOut.toLocaleString("en-IN")}`}
          </Title>
        </Card>
        {/* Bank Details tile */}
        <Card
          className="rounded-2xl border-none shadow-soft bg-white/80 cursor-pointer hover:shadow-md active:scale-95 transition-all"
          onClick={() => setBankModalOpen(true)}
        >
          <div className="flex items-center justify-between">
            <Text type="secondary" className="text-sm font-semibold">
              Bank
            </Text>
            <Pencil size={16} className="text-gray-400" />
          </div>
          <Title
            level={2}
            className="!text-xl !font-extrabold !text-purple-600 !leading-tight"
            style={{ margin: "6px 0 0" }}
          >
            {bankLoading ? (
              <Spin size="small" />
            ) : bankAccount ? (
              <span className="truncate block">{bankAccount.accountHolderName}</span>
            ) : (
              <span className="text-gray-400 font-bold text-lg">Tap to add</span>
            )}
          </Title>
          {bankAccount && (
            <Text type="secondary" className="text-xs">
              ••••{bankAccount.accountNumber.slice(-4)}
            </Text>
          )}
        </Card>
      </div>

      {/* Per-trip earnings cards */}
      <div>
        <div className="flex items-center gap-2 mb-4">
          <Wallet size={22} className="text-primary" />
          <Text strong className="text-xl font-bold">
            Earnings
          </Text>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Spin size="large" />
          </div>
        ) : perTripItems.length === 0 ? (
          <Card className="rounded-3xl border-none shadow-soft bg-white/80">
            <div className="py-6 text-center">
              <Text type="secondary" className="text-base">
                No completed trips yet. Earnings appear here once a trip is marked complete.
              </Text>
            </div>
          </Card>
        ) : (
          <div className="space-y-4">
            {perTripItems.map((item) => (
              <TripEarningsCard
                key={item.trip.id}
                trip={item.trip}
                collected={item.collected}
                fee={item.fee}
                net={item.net}
                payoutStatus={item.payoutStatus}
                hasBankAccount={!!bankAccount}
                availableBalance={earnings.available}
                onWithdraw={() =>
                  setWithdrawTrip({
                    trip: item.trip,
                    net: item.net,
                    grossAmount: item.collected,
                  })
                }
                onAddBank={() => setBankModalOpen(true)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Legacy bulk payout history (requests without a tripId) */}
      {legacyRequests.length > 0 && (
        <div>
          <div className="flex items-center gap-2 mb-4">
            <HistoryIcon size={22} className="text-primary" />
            <Text strong className="text-xl font-bold">
              History
            </Text>
          </div>
          <div className="space-y-3">
            {legacyRequests.map((r) => {
              const fee = r.platformFee ?? estimateFeeFromNet(r.amount);
              return (
                <div
                  key={r.id}
                  className="rounded-2xl border border-black/5 bg-white p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <Text className="text-lg font-bold">₹{r.amount.toLocaleString("en-IN")}</Text>
                    <Tag color={STATUS_COLORS[r.status]} bordered={false} className="text-sm">
                      {STATUS_LABELS[r.status]}
                      {r.status === "part_paid" &&
                        ` · ₹${(r.paidAmount ?? 0).toLocaleString("en-IN")} sent`}
                    </Tag>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {new Date(r.requestedAt).toLocaleDateString("en-IN")} · Commission ₹
                    {fee.toLocaleString("en-IN")}
                  </div>
                  {(r.deduction ?? 0) > 0 && (
                    <div className="text-sm text-rose-600">
                      Deduction ₹{(r.deduction ?? 0).toLocaleString("en-IN")}
                      {r.adminNote ? ` — ${r.adminNote}` : ""}
                    </div>
                  )}
                  {r.paymentReference && (
                    <div className="text-sm">
                      <Text type="secondary">Ref: </Text>
                      <Text>{r.paymentReference}</Text>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Withdraw confirmation modal */}
      <Modal
        open={!!withdrawTrip}
        title={<span className="text-xl font-bold">Confirm withdrawal</span>}
        onCancel={() => setWithdrawTrip(null)}
        footer={null}
        width={480}
        destroyOnClose
      >
        {withdrawTrip && (
          <div className="mt-4 space-y-5">
            {/* Trip summary */}
            <div className="rounded-2xl bg-slate-50 p-4 space-y-1">
              <div className="font-bold text-base">{tripRouteLabel(withdrawTrip.trip)}</div>
              <div className="text-sm text-muted-foreground">
                {new Date(withdrawTrip.trip.departureAt).toLocaleDateString("en-IN", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}{" "}
                · {tripShortId(withdrawTrip.trip.id)}
              </div>
            </div>

            {/* Amount breakdown */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl bg-slate-50 p-3 text-center">
                <div className="text-xs text-muted-foreground font-semibold mb-1">Collected</div>
                <div className="font-extrabold">
                  ₹{withdrawTrip.grossAmount.toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-2xl bg-amber-50 p-3 text-center">
                <div className="text-xs text-amber-600 font-semibold mb-1">Fee (5%)</div>
                <div className="font-extrabold text-amber-600">
                  ₹{platformFee(withdrawTrip.grossAmount).toLocaleString("en-IN")}
                </div>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3 text-center">
                <div className="text-xs text-emerald-600 font-semibold mb-1">You get</div>
                <div className="font-extrabold text-emerald-600">
                  ₹{withdrawTrip.net.toLocaleString("en-IN")}
                </div>
              </div>
            </div>

            {/* Bank details */}
            {bankAccount && (
              <div className="rounded-2xl bg-purple-50 border border-purple-100 p-4 flex items-center justify-between">
                <div>
                  <div className="font-semibold text-sm">{bankAccount.accountHolderName}</div>
                  <div className="text-xs text-muted-foreground">
                    ••••{bankAccount.accountNumber.slice(-4)} · {bankAccount.ifscCode}
                  </div>
                </div>
                <button
                  type="button"
                  className="text-xs text-purple-600 font-semibold"
                  onClick={() => {
                    setWithdrawTrip(null);
                    setBankModalOpen(true);
                  }}
                >
                  Change
                </button>
              </div>
            )}

            <Button
              type="primary"
              block
              size="large"
              loading={requestPayoutMutation.isPending}
              className="bg-gradient-primary border-none rounded-2xl h-14 font-bold text-lg shadow-glow"
              onClick={() => {
                if (withdrawTrip) requestPayoutMutation.mutate(withdrawTrip);
              }}
            >
              Confirm — ₹{withdrawTrip.net.toLocaleString("en-IN")}
            </Button>

            <Text type="secondary" className="block text-xs text-center">
              We'll transfer to your bank account within 3–5 business days.
            </Text>
          </div>
        )}
      </Modal>

      {/* Bank details modal */}
      <Modal
        open={bankModalOpen}
        title={<span className="text-xl font-bold">Bank details</span>}
        onCancel={() => {
          setBankModalOpen(false);
          setBankVerify({ status: "idle" });
          bankForm.resetFields();
          if (bankAccount) {
            bankForm.setFieldsValue({
              accountHolderName: bankAccount.accountHolderName,
              accountNumber: bankAccount.accountNumber,
              confirmAccountNumber: bankAccount.accountNumber,
              ifscCode: bankAccount.ifscCode,
              upiId: bankAccount.upiId ?? undefined,
            });
          }
        }}
        footer={null}
        width={520}
        destroyOnClose
      >
        <Form
          form={bankForm}
          layout="vertical"
          onFinish={(values) => saveBankMutation.mutate(values)}
          onValuesChange={(changed) => {
            // Any edit to the identifying fields invalidates a prior check.
            if (
              "accountNumber" in changed ||
              "ifscCode" in changed ||
              "accountHolderName" in changed
            ) {
              setBankVerify((v) => (v.status === "idle" ? v : { status: "idle" }));
            }
          }}
          className="mt-4"
        >
          {!bankAccount && (
            <Text type="secondary" className="block mb-4 text-base">
              Add your bank details to start requesting payouts.
            </Text>
          )}
          <Form.Item
            label={<span className="text-base font-semibold">Account holder name</span>}
            name="accountHolderName"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input
              size="large"
              className="rounded-2xl h-14 text-lg"
              placeholder="As per bank records"
            />
          </Form.Item>
          <Form.Item
            label={<span className="text-base font-semibold">Account number</span>}
            name="accountNumber"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input
              size="large"
              className="rounded-2xl h-14 text-lg"
              placeholder="Bank account number"
            />
          </Form.Item>
          <Form.Item
            label={<span className="text-base font-semibold">Confirm account number</span>}
            name="confirmAccountNumber"
            dependencies={["accountNumber"]}
            rules={[
              { required: true, message: "Required" },
              ({ getFieldValue }) => ({
                validator(_, value) {
                  if (!value || getFieldValue("accountNumber") === value) {
                    return Promise.resolve();
                  }
                  return Promise.reject(new Error("Account numbers do not match"));
                },
              }),
            ]}
          >
            <Input
              size="large"
              className="rounded-2xl h-14 text-lg"
              placeholder="Re-enter account number"
            />
          </Form.Item>
          <Form.Item
            label={<span className="text-base font-semibold">IFSC code</span>}
            name="ifscCode"
            rules={[{ required: true, message: "Required" }]}
          >
            <Input
              size="large"
              className="rounded-2xl h-14 text-lg"
              placeholder="e.g. HDFC0001234"
              style={{ textTransform: "uppercase" }}
            />
          </Form.Item>

          {/* Instant penny-less bank verification — confirms the account is real
              and belongs to the host, with no test deposit. */}
          <div className="mb-4">
            <Button
              onClick={runBankVerify}
              loading={bankVerify.status === "checking"}
              icon={<ShieldCheck size={18} />}
              size="large"
              className="rounded-2xl h-12 w-full font-semibold border-primary text-primary"
            >
              Verify account
            </Button>
            {bankVerify.status === "done" && bankVerify.exists && bankVerify.nameMatch !== false && (
              <div className="mt-2 flex items-start gap-2 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-800">
                <ShieldCheck size={18} className="mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold">Account verified</div>
                  {bankVerify.nameAtBank && (
                    <div>
                      Bank records show{" "}
                      <span className="font-semibold">{bankVerify.nameAtBank}</span>.
                    </div>
                  )}
                </div>
              </div>
            )}
            {bankVerify.status === "done" && bankVerify.exists && bankVerify.nameMatch === false && (
              <div className="mt-2 flex items-start gap-2 rounded-2xl bg-amber-50 px-4 py-3 text-amber-800">
                <ShieldAlert size={18} className="mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold">Account found — name doesn't match</div>
                  {bankVerify.nameAtBank && (
                    <div>
                      The bank has this account under{" "}
                      <span className="font-semibold">{bankVerify.nameAtBank}</span>. Update the
                      holder name to match, or re-check the number.
                    </div>
                  )}
                </div>
              </div>
            )}
            {bankVerify.status === "done" && !bankVerify.exists && (
              <div className="mt-2 flex items-start gap-2 rounded-2xl bg-rose-50 px-4 py-3 text-rose-700">
                <XCircle size={18} className="mt-0.5 shrink-0" />
                <div className="text-sm">
                  <div className="font-semibold">Account not found</div>
                  <div>Check the account number and IFSC, then try again.</div>
                </div>
              </div>
            )}
            {bankVerify.status === "error" && (
              <div className="mt-2 text-sm text-rose-600">{bankVerify.message}</div>
            )}
          </div>

          <Form.Item
            label={
              <span className="text-base font-semibold">
                UPI ID <span className="text-sm font-normal text-muted-foreground">(optional)</span>
              </span>
            }
            name="upiId"
          >
            <Input
              size="large"
              className="rounded-2xl h-14 text-lg"
              placeholder="e.g. yourname@okhdfc"
            />
          </Form.Item>
          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            loading={saveBankMutation.isPending}
            className="bg-gradient-primary border-none rounded-2xl h-14 font-bold text-lg shadow-glow mt-2"
          >
            Save bank details
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
