import { Drawer } from "antd";
import { MessageThreadView } from "@/components/MessageThreadView";

export interface ThreadParams {
  tripId: string;
  hostUserId: string;
  guestUserId: string;
  otherName: string;
  tripRoute?: string | null;
}

/** Bottom-sheet chat for one guest↔host thread. */
export function MessageThreadDrawer({
  open,
  onClose,
  thread,
}: {
  open: boolean;
  onClose: () => void;
  thread: ThreadParams | null;
}) {
  return (
    <Drawer
      open={open && !!thread}
      onClose={onClose}
      placement="bottom"
      height="85vh"
      title={
        thread ? (
          <div className="min-w-0">
            <p className="truncate font-bold text-gray-900">{thread.otherName}</p>
            {thread.tripRoute && (
              <p className="truncate text-xs font-normal text-muted-foreground">
                {thread.tripRoute}
              </p>
            )}
          </div>
        ) : (
          "Messages"
        )
      }
      styles={{ body: { padding: "8px 12px 12px", display: "flex", flexDirection: "column" } }}
      className="[&_.ant-drawer-content]:rounded-t-3xl"
    >
      {thread && (
        <MessageThreadView
          tripId={thread.tripId}
          hostUserId={thread.hostUserId}
          guestUserId={thread.guestUserId}
          otherName={thread.otherName}
          tripRoute={thread.tripRoute}
        />
      )}
    </Drawer>
  );
}
