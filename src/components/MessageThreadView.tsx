import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Send, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { getUserDisplayName } from "@/lib/user-display";
import {
  listThreadMessages,
  sendMessage,
  markThreadRead,
  makeThreadId,
} from "@/data/appwrite-repository";

/**
 * A single conversation between a guest and a host about one trip. Polls for new
 * messages every few seconds and lets the current user reply. Names are
 * denormalised onto each message so both sides always see who they're talking to.
 */
export function MessageThreadView({
  tripId,
  hostUserId,
  guestUserId,
  otherName,
  tripRoute,
}: {
  tripId: string;
  hostUserId: string;
  guestUserId: string;
  otherName: string;
  tripRoute?: string | null;
}) {
  const { user } = useAuth();
  const me = user?.$id ?? "";
  const iAmHost = me === hostUserId;
  const myName = getUserDisplayName(user);
  const threadId = makeThreadId(tripId, guestUserId);
  const qc = useQueryClient();
  const [text, setText] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data: messages = [] } = useQuery({
    queryKey: ["thread", threadId],
    queryFn: () => listThreadMessages(threadId),
    enabled: !!me,
    refetchInterval: 5000,
  });

  // Mark incoming messages read whenever the thread changes.
  useEffect(() => {
    if (!me || messages.length === 0) return;
    void markThreadRead(threadId, me).then(() =>
      qc.invalidateQueries({ queryKey: ["unread-messages", me] }),
    );
  }, [messages.length, me, threadId, qc]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  const sendMut = useMutation({
    mutationFn: () =>
      sendMessage({
        tripId,
        hostUserId,
        guestUserId,
        senderUserId: me,
        body: text.trim(),
        tripRoute: tripRoute ?? null,
        hostName: iAmHost ? myName : otherName,
        guestName: iAmHost ? otherName : myName,
      }),
    onSuccess: () => {
      setText("");
      void qc.invalidateQueries({ queryKey: ["thread", threadId] });
      void qc.invalidateQueries({ queryKey: ["my-threads", me] });
    },
  });

  const submit = () => {
    if (!me || !text.trim() || sendMut.isPending) return;
    sendMut.mutate();
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Messages */}
      <div className="flex-1 space-y-2 overflow-y-auto px-1 py-2">
        {messages.length === 0 ? (
          <div className="grid h-full place-items-center px-6 text-center">
            <p className="text-sm text-muted-foreground">
              No messages yet. Say hi to {otherName} and sort out your pickup point & timing.
            </p>
          </div>
        ) : (
          messages.map((m) => {
            const mine = m.senderUserId === me;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm ${
                    mine
                      ? "rounded-br-md bg-gradient-primary text-white"
                      : "rounded-bl-md bg-gray-100 text-gray-900"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                </div>
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Composer */}
      <div className="flex items-end gap-2 border-t border-gray-100 bg-white px-1 pt-3">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit();
            }
          }}
          rows={1}
          placeholder={`Message ${otherName}…`}
          className="max-h-28 min-h-[44px] flex-1 resize-none rounded-2xl border border-gray-200 bg-white px-4 py-2.5 text-base outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || sendMut.isPending}
          aria-label="Send"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-gradient-primary text-white shadow-glow transition active:scale-95 disabled:opacity-50"
        >
          {sendMut.isPending ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <Send className="h-5 w-5" />
          )}
        </button>
      </div>
    </div>
  );
}
