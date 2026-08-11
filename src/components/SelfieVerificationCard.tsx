import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { message } from "antd";
import { ShieldCheck, ShieldAlert, ShieldQuestion, Loader2 } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { PhotoCapture } from "@/components/PhotoCapture";
import {
  getMyMemberVerification,
  submitSelfieVerification,
  uploadPrivatePhoto,
} from "@/data/appwrite-repository";

/**
 * Every member verifies a selfie once. Private — only admins ever see the
 * image (uploader-only file permissions; admins view via a server function).
 * Shows current status and lets the member (re)submit.
 */
export function SelfieVerificationCard({ className = "" }: { className?: string }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);

  const { data: verification, isLoading } = useQuery({
    queryKey: ["my-verification", user?.$id],
    queryFn: () => (user ? getMyMemberVerification(user.$id) : Promise.resolve(null)),
    enabled: !!user,
  });

  const submit = useMutation({
    mutationFn: async () => {
      if (!user || !file) throw new Error("Take a selfie first.");
      const fileId = await uploadPrivatePhoto(user.$id, file);
      await submitSelfieVerification({
        userId: user.$id,
        selfieFileId: fileId,
        displayName: user.name || undefined,
        phone: (user.prefs as any)?.phone || user.phone || undefined,
      });
    },
    onSuccess: () => {
      setFile(null);
      void queryClient.invalidateQueries({ queryKey: ["my-verification", user?.$id] });
      message.success("Selfie submitted — we'll verify it shortly.");
    },
    onError: (e) => message.error(e instanceof Error ? e.message : "Couldn't submit selfie."),
  });

  if (!user) return null;

  const status = verification?.status;
  const approved = status === "approved";
  const pending = status === "pending" && verification?.selfieFileId;
  const rejected = status === "rejected";

  return (
    <div className={`rounded-3xl border border-gray-100 bg-white p-5 shadow-sm ${className}`}>
      <div className="flex items-start gap-3">
        <div
          className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl ${
            approved
              ? "bg-emerald-50 text-emerald-600"
              : rejected
                ? "bg-rose-50 text-rose-600"
                : "bg-primary/10 text-primary"
          }`}
        >
          {approved ? (
            <ShieldCheck size={20} />
          ) : rejected ? (
            <ShieldAlert size={20} />
          ) : (
            <ShieldQuestion size={20} />
          )}
        </div>
        <div className="flex-1">
          <p className="font-bold text-gray-900">Identity verification</p>
          <p className="text-sm text-muted-foreground">
            {approved
              ? "You're verified. Your selfie is private — only Coolpool admins can see it."
              : pending
                ? "Selfie submitted — pending review. It's private to admins only."
                : rejected
                  ? `Your last selfie wasn't accepted${verification?.adminNote ? ` — ${verification.adminNote}` : ""}. Please retake.`
                  : "Add a quick selfie to get the verified badge. It stays private — never shown on your public profile."}
          </p>
        </div>
        {approved && (
          <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">
            Verified
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="mt-4 flex justify-center py-4 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : !approved && !pending ? (
        <div className="mt-5 flex flex-col items-center gap-4">
          <PhotoCapture facing="user" label="Take a selfie" onCapture={setFile} disabled={submit.isPending} />
          <button
            type="button"
            onClick={() => submit.mutate()}
            disabled={!file || submit.isPending}
            className="w-full max-w-xs rounded-2xl bg-gradient-primary py-3 text-sm font-bold text-white shadow-glow disabled:opacity-50"
          >
            {submit.isPending ? "Submitting…" : "Submit for verification"}
          </button>
        </div>
      ) : null}
    </div>
  );
}
