import "antd/dist/reset.css";
import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ConfigProvider,
  Layout,
  Menu,
  Typography,
  Card,
  Avatar,
  Button,
  Badge,
  Dropdown,
} from "antd";
import {
  Route as RouteIcon,
  LogOut,
  LayoutDashboard,
  Settings,
  User,
  Activity,
  Image as ImageIcon,
  Car,
  Ticket,
  Wallet,
  UserX,
  ShieldCheck,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { listActiveTrips } from "@/data/appwrite-repository";
import { BannersManager } from "@/components/admin/BannersManager";
import { DeletedAccountsPanel } from "@/components/admin/DeletedAccountsPanel";
import { OverviewPanel } from "@/components/admin/OverviewPanel";
import { GuestManagementPanel } from "@/components/admin/GuestManagementPanel";
import { HostManagementPanel } from "@/components/admin/HostManagementPanel";
import { TripsPanel } from "@/components/admin/TripsPanel";
import { BookingsPanel } from "@/components/admin/BookingsPanel";
import { PayoutsPanel } from "@/components/admin/PayoutsPanel";
import { VerificationsPanel } from "@/components/admin/VerificationsPanel";
import { UserProfileModal } from "@/components/UserProfileModal";
import { getUserDisplayName } from "@/lib/user-display";
import logo from "@/assets/logo.png";
import { APP_FONT_FAMILY } from "@/lib/fonts";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const MODULE_TITLES: Record<string, string> = {
  overview: "Dashboard Overview",
  users: "User Management",
  vehicles: "Vehicle Manager",
  trips: "Trip Manager",
  bookings: "Booking Manager",
  pricing: "Pricing Rules",
  payouts: "Payouts",
  banners: "Banners Manager",
};

export const Route = createFileRoute("/admin/dashboard")({
  head: () => ({
    meta: [
      { title: "Admin dashboard — Coolpool" },
      { name: "description", content: "Manage drivers and active trips." },
    ],
  }),
  component: AdminDashboardPage,
});

function AdminDashboardPage() {
  const { isAdmin, signOut, user, roles } = useAuth();
  const [activeModule, setActiveModule] = useState("overview");
  const [profileModalOpen, setProfileModalOpen] = useState(false);

  const { data: trips = [], isLoading: tripsLoading } = useQuery({
    queryKey: ["admin-active-trips"],
    queryFn: () => listActiveTrips(200),
    enabled: isAdmin,
  });

  if (!isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-hero p-4">
        <Card className="max-w-md text-center rounded-3xl border-none shadow-elevated bg-white/90 backdrop-blur-md">
          <Text type="danger" strong className="text-lg">
            ACCESS DENIED
          </Text>
          <p className="mt-2 text-muted-foreground">
            This workspace is restricted to administrator accounts.
          </p>
          <Button
            type="primary"
            size="large"
            className="mt-4 rounded-3xl bg-gradient-primary border-none"
            onClick={() => void signOut()}
          >
            Sign out
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: "#6b46c1",
          borderRadius: 16,
          fontFamily: APP_FONT_FAMILY,
          fontSize: 15,
          fontSizeLG: 17,
          fontSizeXL: 20,
          fontSizeHeading1: 38,
          fontSizeHeading2: 30,
          fontSizeHeading3: 24,
          fontSizeHeading4: 20,
          fontSizeHeading5: 17,
          lineHeight: 1.6,
          controlHeight: 44,
          controlHeightLG: 52,
          paddingContentVertical: 16,
          paddingContentHorizontal: 20,
        },
        components: {
          Layout: {
            headerBg: "rgba(255, 255, 255, 0.7)",
            siderBg: "transparent",
            bodyBg: "transparent",
          },
          Menu: {
            itemBg: "transparent",
            itemSelectedBg: "rgba(107, 70, 193, 0.1)",
            itemSelectedColor: "#6b46c1",
            itemHeight: 52,
            iconSize: 20,
            fontSize: 15,
          },
          Table: {
            fontSize: 14,
            headerBg: "rgba(107,70,193,0.05)",
            rowHoverBg: "rgba(107,70,193,0.04)",
            cellPaddingBlock: 14,
            cellPaddingInline: 16,
          },
          Card: {
            paddingLG: 28,
          },
          Input: {
            fontSize: 15,
          },
          Button: {
            fontSize: 15,
            fontWeight: 600,
          },
          Tag: {
            fontSize: 13,
            paddingInline: 10,
          },
        },
      }}
    >
      <Layout className="min-h-screen bg-gradient-hero">
        <Sider
          breakpoint="lg"
          collapsedWidth="0"
          width={300}
          className="border-r border-border/60 backdrop-blur-xl hidden lg:block"
          style={{ position: "sticky", top: 0, height: "100vh", left: 0, zIndex: 100 }}
        >
          {/* 3-part column: fixed logo, scrollable menu, fixed traffic card.
              The menu scrolls on short windows so every item stays reachable,
              and the bottom card can no longer overlap menu items. */}
          <div className="flex h-full flex-col">
            <div className="shrink-0 p-6 text-center">
              <img src={logo} alt="Coolpool Logo" className="h-28 w-auto mx-auto object-contain" />
            </div>

            <div className="admin-sider-scroll min-h-0 flex-1 overflow-y-auto">
              <Menu
                mode="inline"
                selectedKeys={[activeModule]}
                onClick={({ key }) => setActiveModule(key)}
                className="border-none px-3 mt-2"
                items={[
                  { key: "overview",  icon: <LayoutDashboard size={20} />, label: "Overview" },
                  { key: "guests",    icon: <Ticket size={20} />,          label: "Guest Management" },
                  { key: "hosts",     icon: <Car size={20} />,             label: "Host Management" },
                  { key: "trips",     icon: <RouteIcon size={20} />,       label: "Trip Manager" },
                  { key: "bookings",  icon: <Ticket size={20} />,          label: "Booking Manager" },
                  { key: "payouts",   icon: <Wallet size={20} />,          label: "Payouts" },
                  { key: "verifications", icon: <ShieldCheck size={20} />, label: "Verifications" },
                  { key: "banners",   icon: <ImageIcon size={20} />,       label: "Banners Manager" },
                  { key: "deleted",   icon: <UserX size={20} />,           label: "Deleted Accounts" },
                ]}
              />
            </div>

            <div className="shrink-0 p-5">
              <Card className="rounded-3xl bg-secondary/40 border-none backdrop-blur-md">
                <div className="flex items-center gap-4">
                  <Badge count={trips.length} overflowCount={99} color="#6b46c1">
                    <Avatar size={44} icon={<Activity size={18} />} className="bg-primary/20 text-primary" />
                  </Badge>
                  <div>
                    <p className="text-sm text-muted-foreground">Active Traffic</p>
                    <p className="text-xl font-bold leading-tight">
                      {tripsLoading ? "…" : trips.length} routes
                    </p>
                  </div>
                </div>
              </Card>
            </div>
          </div>
        </Sider>

        <Layout>
          <Header className="px-8 flex items-center justify-between border-b border-border/60 backdrop-blur-md sticky top-0 z-10 bg-background/60" style={{ height: 80 }}>
            <div>
              <Title level={3} style={{ margin: 0 }} className="hidden sm:block">
                {MODULE_TITLES[activeModule] ?? "Dashboard"}
              </Title>
              <div className="sm:hidden">
                <img src={logo} alt="Coolpool Logo" className="h-16 w-auto object-contain" />
              </div>
            </div>
            <div className="flex items-center gap-5">
              <div className="text-right hidden md:flex flex-col justify-center max-w-[200px]">
                <Text strong className="text-base leading-tight block truncate">
                  {getUserDisplayName(user)}
                </Text>
                <Text className="text-xs text-primary font-bold uppercase tracking-wider leading-tight truncate">
                  {user?.email ?? "Administrator"}
                </Text>
              </div>

              <Dropdown
                menu={{
                  onClick: ({ key }) => {
                    if (key === "profile") setProfileModalOpen(true);
                  },
                  items: [
                    { key: "profile", label: "My Profile", icon: <User size={16} /> },
                    { key: "settings", label: "System Config", icon: <Settings size={16} /> },
                    { type: "divider" },
                    {
                      key: "logout",
                      label: "Logout",
                      icon: <LogOut size={16} />,
                      danger: true,
                      onClick: () => void signOut(),
                    },
                  ],
                }}
                trigger={["click"]}
                placement="bottomRight"
              >
                <Badge dot status="processing" offset={[-5, 38]} color="#6b46c1">
                  <Avatar
                    icon={<User size={22} />}
                    className="bg-gradient-primary cursor-pointer shadow-soft border-2 border-white/50"
                    size={48}
                  />
                </Badge>
              </Dropdown>
            </div>
          </Header>

          <Content className="p-6 md:p-10 max-w-7xl mx-auto w-full">
            {activeModule === "overview"  && <OverviewPanel onNavigate={setActiveModule} />}
            {activeModule === "guests"    && <GuestManagementPanel />}
            {activeModule === "hosts"     && <HostManagementPanel />}
            {activeModule === "trips"     && <TripsPanel />}
            {activeModule === "bookings"  && <BookingsPanel />}
            {activeModule === "payouts"   && <PayoutsPanel />}
            {activeModule === "verifications" && <VerificationsPanel />}
            {activeModule === "banners"   && <BannersManager />}
            {activeModule === "deleted"   && <DeletedAccountsPanel />}
          </Content>
        </Layout>
      </Layout>

      <UserProfileModal
        open={profileModalOpen}
        onClose={() => setProfileModalOpen(false)}
        user={user}
        roles={roles}
      />
    </ConfigProvider>
  );
}
