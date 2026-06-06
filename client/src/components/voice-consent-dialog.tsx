import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ShieldCheck } from "lucide-react";

interface VoiceConsentDialogProps {
  open: boolean;
  onConsent: () => void;
  onDecline: () => void;
}

export function VoiceConsentDialog({ open, onConsent, onDecline }: VoiceConsentDialogProps) {
  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        hideClose
        className="h-screen max-h-screen w-screen max-w-none translate-x-[-50%] translate-y-[-50%] overflow-y-auto rounded-none border-0 sm:rounded-none"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
        data-testid="dialog-voice-consent"
      >
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col justify-center gap-6 py-8">
          <DialogHeader className="text-left">
            <div className="mb-2 flex h-12 w-12 items-center justify-center rounded-md bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <DialogTitle className="text-2xl">Voice recording consent</DialogTitle>
            <DialogDescription>موافقة تسجيل الصوت</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 md:grid-cols-2">
            <section className="rounded-md border bg-card p-5 text-sm leading-relaxed">
              <p className="font-medium text-foreground">
                Before we begin, we need your consent to record and process your voice.
              </p>
              <p className="mt-4 text-muted-foreground">Your voice recording will be:</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-muted-foreground">
                <li>Transcribed by AI to text</li>
                <li>Used to generate an assessment score</li>
                <li>Stored securely in accordance with UAE PDPL</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                You can withdraw consent at any time by leaving the session. Recorded audio is retained for 30 days and then deleted.
              </p>
              <p className="mt-4 font-medium text-foreground">
                By continuing, you consent to voice recording and AI processing of your response.
              </p>
            </section>

            <section className="rounded-md border bg-card p-5 text-right text-sm leading-relaxed" dir="rtl">
              <p className="font-medium text-foreground">
                قبل البدء، نحتاج إلى موافقتك على تسجيل صوتك ومعالجته.
              </p>
              <p className="mt-4 text-muted-foreground">سيتم استخدام تسجيلك الصوتي من أجل:</p>
              <ul className="mt-2 list-disc space-y-1 pr-5 text-muted-foreground">
                <li>تحويله إلى نص بواسطة الذكاء الاصطناعي</li>
                <li>إنشاء درجة تقييم</li>
                <li>تخزينه بشكل آمن وفقاً للقانون الاتحادي لحماية البيانات الشخصية</li>
              </ul>
              <p className="mt-4 text-muted-foreground">
                يمكنك سحب موافقتك في أي وقت بمغادرة الجلسة. يُحتفظ بالتسجيل الصوتي لمدة 30 يوماً ثم يُحذف.
              </p>
              <p className="mt-4 font-medium text-foreground">
                بالمتابعة، فإنك توافق على تسجيل صوتك ومعالجته بواسطة الذكاء الاصطناعي.
              </p>
            </section>
          </div>

          <DialogFooter className="gap-2 sm:justify-between sm:space-x-0">
            <Button
              type="button"
              variant="secondary"
              className="w-full sm:w-auto"
              onClick={onDecline}
              data-testid="button-consent-decline"
            >
              I Do Not Consent / لا أوافق
            </Button>
            <Button
              type="button"
              className="w-full bg-green-600 text-white hover:bg-green-700 sm:w-auto"
              onClick={onConsent}
              data-testid="button-consent-accept"
            >
              I Consent / أوافق
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
