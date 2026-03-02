import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/lib/websocket";
import { createPeerConnection, createScreenShareOffer, getScreenStream, getAudioStream } from "@/lib/webrtc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Lightbulb,
  Send,
  Phone,
  Monitor,
  Check,
  X,
  MessageCircle,
  Loader2,
} from "lucide-react";
import type { SupportRequest, ChatMessage } from "@shared/schema";

interface HelpSupportPopoverProps {
  role: "professor" | "student";
  activeTab?: "simple" | "classes";
}

export function HelpSupportPopover({ role, activeTab }: HelpSupportPopoverProps) {
  const [supportMessage, setSupportMessage] = useState("");
  const [chatInput, setChatInput] = useState("");
  const [justSubmitted, setJustSubmitted] = useState(false);
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [screenSharePrompt, setScreenSharePrompt] = useState(false);
  const [callPrompt, setCallPrompt] = useState(false);
  const [screenShareRequestId, setScreenShareRequestId] = useState<string | null>(null);
  const [callRequestId, setCallRequestId] = useState<string | null>(null);
  const [adminUserId, setAdminUserId] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, onMessage } = useWebSocket();

  const { data: activeRequest, refetch: refetchRequest } = useQuery<SupportRequest | null>({
    queryKey: ["/api/my-support-request"],
    retry: false,
  });

  const requestId = activeRequest?.id;

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/support-requests", requestId, "messages"],
    enabled: !!requestId && activeRequest?.status !== "resolved",
  });

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  useEffect(() => {
    const cleanup1 = onMessage("chat_message", (data: any) => {
      if (data.supportRequestId === requestId) {
        setLocalMessages((prev) => {
          if (prev.some((m) => m.id === data.message?.id)) return prev;
          return [...prev, data.message];
        });
      }
    });

    const cleanup2 = onMessage("support_status_update", (data: any) => {
      if (data.supportRequestId === requestId) {
        refetchRequest();
      }
    });

    const cleanup3 = onMessage("screen_share_offer", (data: any) => {
      setScreenShareRequestId(data.supportRequestId || null);
      setAdminUserId(data.from || null);
      setScreenSharePrompt(true);
    });

    const cleanup4 = onMessage("call_request", (data: any) => {
      setCallRequestId(data.supportRequestId || null);
      setAdminUserId(data.from || null);
      setCallPrompt(true);
    });

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
      cleanup4();
    };
  }, [onMessage, requestId, refetchRequest]);

  const createRequestMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/support-requests", {
        message: supportMessage,
        pageUrl: window.location.pathname,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/my-support-request"] });
      setSupportMessage("");
      setJustSubmitted(true);
    },
  });

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!requestId) return;
      const res = await apiRequest("POST", `/api/support-requests/${requestId}/messages`, {
        message: chatInput,
      });
      return res.json();
    },
    onSuccess: () => {
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/support-requests", requestId, "messages"] });
    },
  });

  const handleAcceptScreenShare = async () => {
    setScreenSharePrompt(false);
    try {
      const stream = await getScreenStream();
      const pc = createPeerConnection({
        onTrack: () => {},
        onIceCandidate: (candidate) => {
          if (candidate && adminUserId) {
            sendMessage("ice_candidate", { candidate, targetUserId: adminUserId });
          }
        },
        onConnectionStateChange: () => {},
      });
      const offer = await createScreenShareOffer(pc, stream);
      sendMessage("screen_share_answer", { offer, targetUserId: adminUserId });
    } catch (e) {
      console.error("Screen share failed:", e);
    }
  };

  const handleAcceptCall = async () => {
    setCallPrompt(false);
    try {
      const stream = await getAudioStream();
      const pc = createPeerConnection({
        onTrack: (remoteStream) => {
          const audio = new Audio();
          audio.srcObject = remoteStream;
          audio.play();
        },
        onIceCandidate: (candidate) => {
          if (candidate && adminUserId) {
            sendMessage("ice_candidate", { candidate, targetUserId: adminUserId });
          }
        },
        onConnectionStateChange: () => {},
      });
      for (const track of stream.getTracks()) {
        pc.addTrack(track, stream);
      }
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendMessage("call_answer", { offer, targetUserId: adminUserId });
    } catch (e) {
      console.error("Call setup failed:", e);
    }
  };

  const handleStartNewRequest = () => {
    setJustSubmitted(false);
    queryClient.invalidateQueries({ queryKey: ["/api/my-support-request"] });
  };

  const renderGuide = () => {
    if (role === "professor" && activeTab === "classes") {
      return (
        <div className="space-y-2">
          <p className="font-semibold">Classes</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-sm">
            <li>Create a class under your university</li>
            <li>Upload course materials</li>
            <li>Share the class join code with students</li>
            <li>Students join using the code on the login page</li>
            <li>Create exams - AI can generate questions from materials</li>
          </ol>
        </div>
      );
    }
    if (role === "professor") {
      return (
        <div className="space-y-2">
          <p className="font-semibold">Quick Exam</p>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-sm">
            <li>Type exam title</li>
            <li>Add questions</li>
            <li>Optionally set dates</li>
            <li>Type student names</li>
            <li>Click Create Exam - a 5-digit code is generated automatically</li>
            <li>Share the code with students (expires in 30 min)</li>
          </ol>
        </div>
      );
    }
    return (
      <div className="space-y-2">
        <p className="font-semibold">How to take an exam</p>
        <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-sm">
          <li>Enter your exam code or class code on the login page</li>
          <li>Find your exam under Active Exams</li>
          <li>Click Take Exam</li>
          <li>Allow camera and screen sharing</li>
          <li>Answer each question</li>
          <li>Click Submit - scores appear right away</li>
        </ol>
      </div>
    );
  };

  const renderSupport = () => {
    if (screenSharePrompt) {
      return (
        <div className="space-y-3 text-center py-4">
          <Monitor className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">Support admin wants to view your screen to help you</p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" onClick={handleAcceptScreenShare} data-testid="button-accept-screen-share">
              <Check className="h-4 w-4 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setScreenSharePrompt(false);
              sendMessage("screen_share_decline", { supportRequestId: screenShareRequestId });
            }} data-testid="button-decline-screen-share">
              <X className="h-4 w-4 mr-1" /> Decline
            </Button>
          </div>
        </div>
      );
    }

    if (callPrompt) {
      return (
        <div className="space-y-3 text-center py-4">
          <Phone className="h-8 w-8 mx-auto text-muted-foreground" />
          <p className="text-sm font-medium">Support is requesting a voice call</p>
          <div className="flex gap-2 justify-center">
            <Button size="sm" onClick={handleAcceptCall} data-testid="button-accept-call">
              <Check className="h-4 w-4 mr-1" /> Accept
            </Button>
            <Button size="sm" variant="outline" onClick={() => {
              setCallPrompt(false);
              sendMessage("call_decline", { supportRequestId: callRequestId });
            }} data-testid="button-decline-call">
              <X className="h-4 w-4 mr-1" /> Decline
            </Button>
          </div>
        </div>
      );
    }

    if (activeRequest && activeRequest.status === "resolved") {
      return (
        <div className="space-y-3 text-center py-4">
          <Check className="h-8 w-8 mx-auto text-green-500" />
          <p className="text-sm font-medium">Your issue has been resolved</p>
          <Button size="sm" variant="outline" onClick={handleStartNewRequest} data-testid="button-new-request">
            Start New Request
          </Button>
        </div>
      );
    }

    if (activeRequest && activeRequest.status !== "resolved") {
      return (
        <div className="flex flex-col h-64">
          <div className="flex items-center gap-2 mb-2">
            <MessageCircle className="h-4 w-4" />
            <span className="text-sm font-medium">Support Chat</span>
            <Badge variant="secondary" className="text-xs">
              {activeRequest.status}
            </Badge>
          </div>
          <ScrollArea className="flex-1 pr-2">
            <div className="space-y-2">
              {localMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${msg.senderRole === "admin" ? "justify-start" : "justify-end"}`}
                  data-testid={`chat-message-${msg.id}`}
                >
                  <div
                    className={`rounded-md px-3 py-2 text-sm max-w-[80%] ${
                      msg.senderRole === "admin"
                        ? "bg-muted text-foreground"
                        : "bg-primary text-primary-foreground"
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>
          <div className="flex gap-2 mt-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              placeholder="Type a message..."
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey && chatInput.trim()) {
                  e.preventDefault();
                  sendMessageMutation.mutate();
                }
              }}
              data-testid="input-chat-message"
            />
            <Button
              size="icon"
              onClick={() => sendMessageMutation.mutate()}
              disabled={!chatInput.trim() || sendMessageMutation.isPending}
              data-testid="button-send-message"
            >
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </div>
      );
    }

    if (justSubmitted) {
      return (
        <div className="space-y-3 text-center py-4">
          <Loader2 className="h-8 w-8 mx-auto text-primary animate-spin" />
          <p className="text-sm font-medium">Support request sent!</p>
          <p className="text-xs text-muted-foreground">We'll be with you shortly.</p>
        </div>
      );
    }

    return (
      <div className="space-y-3">
        <p className="text-sm font-medium">Need help?</p>
        <Textarea
          value={supportMessage}
          onChange={(e) => setSupportMessage(e.target.value)}
          placeholder="Describe your issue (optional)..."
          className="resize-none text-sm"
          rows={3}
          data-testid="textarea-support-message"
        />
        <Button
          className="w-full"
          size="sm"
          onClick={() => createRequestMutation.mutate()}
          disabled={createRequestMutation.isPending}
          data-testid="button-request-support"
        >
          {createRequestMutation.isPending ? "Sending..." : "Request Support"}
        </Button>
      </div>
    );
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" data-testid="button-help">
          <Lightbulb className="h-4 w-4 text-amber-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm" align="end">
        <Tabs defaultValue="guide">
          <TabsList className="grid w-full grid-cols-2 mb-3">
            <TabsTrigger value="guide" data-testid="tab-guide">Guide</TabsTrigger>
            <TabsTrigger value="support" data-testid="tab-support">Support</TabsTrigger>
          </TabsList>
          <TabsContent value="guide">
            {renderGuide()}
          </TabsContent>
          <TabsContent value="support">
            {renderSupport()}
          </TabsContent>
        </Tabs>
      </PopoverContent>
    </Popover>
  );
}
