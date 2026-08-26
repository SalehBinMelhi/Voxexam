import { useState, useEffect, useRef } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useWebSocket } from "@/lib/websocket";
import { createPeerConnection, handleScreenShareAnswer, addIceCandidate } from "@/lib/webrtc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { AdminClassManagement } from "@/components/admin-class-management";
import {
  LogOut,
  GraduationCap,
  Send,
  Phone,
  Monitor,
  Check,
  MessageCircle,
  Bell,
  MicOff,
  Mic,
  X,
} from "lucide-react";
import type { SupportRequest, ChatMessage } from "@shared/schema";

function getStatusBadge(status: string) {
  switch (status) {
    case "pending":
      return <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 dark:text-yellow-400 border-yellow-500/30">{status}</Badge>;
    case "in-progress":
      return <Badge variant="outline" className="bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/30">{status}</Badge>;
    case "resolved":
      return <Badge variant="outline" className="bg-green-500/10 text-green-600 dark:text-green-400 border-green-500/30">{status}</Badge>;
    default:
      return <Badge variant="secondary">{status}</Badge>;
  }
}

function getRoleBadge(role: string | null) {
  if (!role) return null;
  return <Badge variant="secondary" className="text-xs">{role}</Badge>;
}

export default function AdminDashboard() {
  const { user, logoutUrl } = useAuth();
  const [selectedRequestId, setSelectedRequestId] = useState<string | null>(null);
  const [chatInput, setChatInput] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [audioStream, setAudioStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const { sendMessage, onMessage } = useWebSocket();

  const { data: supportRequests = [] } = useQuery<SupportRequest[]>({
    queryKey: ["/api/admin/support-requests"],
  });

  const selectedRequest = supportRequests.find((r) => r.id === selectedRequestId);

  const { data: messages = [] } = useQuery<ChatMessage[]>({
    queryKey: ["/api/support-requests", selectedRequestId, "messages"],
    enabled: !!selectedRequestId,
  });

  useEffect(() => {
    setLocalMessages(messages);
  }, [messages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages]);

  useEffect(() => {
    if (videoRef.current && remoteStream) {
      videoRef.current.srcObject = remoteStream;
    }
  }, [remoteStream]);

  useEffect(() => {
    const cleanup1 = onMessage("chat_message", (data: any) => {
      if (data.supportRequestId === selectedRequestId) {
        setLocalMessages((prev) => {
          if (prev.some((m) => m.id === data.message?.id)) return prev;
          return [...prev, data.message];
        });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-requests"] });
    });

    const cleanup2 = onMessage("support_status_update", () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-requests"] });
    });

    const cleanup3 = onMessage("screen_share_answer", async (data: any) => {
      if (data.offer) {
        const fromUserId = data.from;
        const pc = createPeerConnection({
          onTrack: (stream) => setRemoteStream(stream),
          onIceCandidate: (candidate) => {
            if (candidate) {
              sendMessage("ice_candidate", { candidate, targetUserId: fromUserId });
            }
          },
          onConnectionStateChange: () => {},
        });
        pcRef.current = pc;
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendMessage("screen_share_complete", { answer, targetUserId: fromUserId });
      }
    });

    const cleanup4 = onMessage("call_answer", async (data: any) => {
      if (data.offer) {
        const fromUserId = data.from;
        const pc = createPeerConnection({
          onTrack: (stream) => {
            const audio = new Audio();
            audio.srcObject = stream;
            audio.play();
            setAudioStream(stream);
          },
          onIceCandidate: (candidate) => {
            if (candidate) {
              sendMessage("ice_candidate", { candidate, targetUserId: fromUserId });
            }
          },
          onConnectionStateChange: () => {},
        });
        pcRef.current = pc;
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        sendMessage("call_complete", { answer, targetUserId: fromUserId });
      }
    });

    const cleanup5 = onMessage("ice_candidate", async (data: any) => {
      if (pcRef.current && data.candidate) {
        await addIceCandidate(pcRef.current, data.candidate);
      }
    });

    return () => {
      cleanup1();
      cleanup2();
      cleanup3();
      cleanup4();
      cleanup5();
    };
  }, [onMessage, selectedRequestId, sendMessage]);

  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedRequestId) return;
      const res = await apiRequest("POST", `/api/support-requests/${selectedRequestId}/messages`, {
        message: chatInput,
      });
      return res.json();
    },
    onSuccess: () => {
      setChatInput("");
      queryClient.invalidateQueries({ queryKey: ["/api/support-requests", selectedRequestId, "messages"] });
    },
  });

  const resolveRequestMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest("PATCH", `/api/admin/support-requests/${id}`, { status: "resolved" });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/support-requests"] });
    },
  });

  const handleViewScreen = () => {
    if (!selectedRequestId || !selectedRequest) return;
    sendMessage("screen_share_offer", { supportRequestId: selectedRequestId, targetUserId: selectedRequest.userId });
  };

  const handleRequestCall = () => {
    if (!selectedRequestId || !selectedRequest) return;
    sendMessage("call_request", { supportRequestId: selectedRequestId, targetUserId: selectedRequest.userId });
  };

  const handleToggleMute = () => {
    if (audioStream) {
      audioStream.getAudioTracks().forEach((track) => {
        track.enabled = !track.enabled;
      });
      setIsMuted(!isMuted);
    }
  };

  const pendingCount = supportRequests.filter((r) => r.status === "pending").length;

  const filteredRequests = statusFilter === "all"
    ? supportRequests
    : supportRequests.filter((r) => r.status === statusFilter);

  const displayName = user?.firstName
    ? `${user.firstName} ${user.lastName || ""}`.trim()
    : user?.email || "Admin";

  return (
    <div className="min-h-screen bg-background" data-testid="admin-dashboard">
      <header className="border-b bg-card sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-md flex items-center justify-center" style={{ backgroundColor: "hsl(var(--brand-logo-bg))" }}>
              <GraduationCap className="h-5 w-5" style={{ color: "hsl(var(--brand-logo-fg))" }} />
            </div>
            <div>
              <h1 className="font-semibold"><span style={{ color: "hsl(var(--brand-text))" }}>Vox</span>Exams</h1>
              <p className="text-xs text-muted-foreground">Admin Dashboard</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="relative">
              <Bell className="h-5 w-5 text-muted-foreground" />
              {pendingCount > 0 && (
                <span className="absolute -top-1.5 -right-1.5 bg-destructive text-destructive-foreground text-xs rounded-full w-4 h-4 flex items-center justify-center" data-testid="badge-pending-count">
                  {pendingCount}
                </span>
              )}
            </div>
            <span className="text-sm text-muted-foreground hidden sm:inline">{displayName}</span>
            <ThemeToggle />
            <a href={logoutUrl}>
              <Button variant="ghost" size="icon" data-testid="button-logout">
                <LogOut className="h-4 w-4" />
              </Button>
            </a>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        <Tabs defaultValue="classes" className="w-full">
          <TabsList className="mb-6">
            <TabsTrigger value="classes">Class Management</TabsTrigger>
            <TabsTrigger value="support">Support Requests</TabsTrigger>
          </TabsList>
          
          <TabsContent value="classes" className="mt-0">
            <AdminClassManagement />
          </TabsContent>
          
          <TabsContent value="support" className="mt-0">
            <div className="flex flex-col lg:flex-row gap-6">
              <div className="lg:w-1/3 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-lg font-semibold">Support Requests</h2>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-36" data-testid="select-status-filter">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in-progress">In Progress</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <ScrollArea className="h-[calc(100vh-200px)]">
              <div className="space-y-3 pr-2">
                {filteredRequests.length === 0 && (
                  <p className="text-sm text-muted-foreground text-center py-8">No support requests</p>
                )}
                {filteredRequests.map((req) => (
                  <Card
                    key={req.id}
                    className={`cursor-pointer hover-elevate ${selectedRequestId === req.id ? "ring-2 ring-primary" : ""}`}
                    onClick={() => setSelectedRequestId(req.id)}
                    data-testid={`card-support-request-${req.id}`}
                  >
                    <CardContent className="p-4 space-y-2">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid={`text-user-name-${req.id}`}>
                          {req.userName || "Unknown User"}
                        </span>
                        <div className="flex items-center gap-1">
                          {getRoleBadge(req.userRole)}
                          {getStatusBadge(req.status)}
                        </div>
                      </div>
                      {req.message && (
                        <p className="text-xs text-muted-foreground line-clamp-2" data-testid={`text-message-preview-${req.id}`}>
                          {req.message}
                        </p>
                      )}
                      {req.createdAt && (
                        <p className="text-xs text-muted-foreground" data-testid={`text-timestamp-${req.id}`}>
                          {new Date(req.createdAt).toLocaleString()}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            </ScrollArea>
          </div>

          <div className="lg:w-2/3">
            {!selectedRequest ? (
              <div className="flex items-center justify-center h-[calc(100vh-200px)]">
                <div className="text-center text-muted-foreground">
                  <MessageCircle className="h-12 w-12 mx-auto mb-3 opacity-30" />
                  <p className="text-sm">Select a support request to view details</p>
                </div>
              </div>
            ) : (
              <Card className="h-[calc(100vh-200px)] flex flex-col">
                <div className="p-4 border-b flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{selectedRequest.userName || "Unknown User"}</span>
                    {getRoleBadge(selectedRequest.userRole)}
                    {getStatusBadge(selectedRequest.status)}
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleViewScreen}
                      disabled={selectedRequest.status === "resolved"}
                      data-testid="button-view-screen"
                    >
                      <Monitor className="h-4 w-4 mr-1" /> View Screen
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleRequestCall}
                      disabled={selectedRequest.status === "resolved"}
                      data-testid="button-request-call"
                    >
                      <Phone className="h-4 w-4 mr-1" /> Request Call
                    </Button>
                    {selectedRequest.status !== "resolved" && (
                      <Button
                        size="sm"
                        onClick={() => resolveRequestMutation.mutate(selectedRequest.id)}
                        disabled={resolveRequestMutation.isPending}
                        data-testid="button-mark-resolved"
                      >
                        <Check className="h-4 w-4 mr-1" /> Mark Resolved
                      </Button>
                    )}
                  </div>
                </div>

                {remoteStream && (
                  <div className="p-4 border-b">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className="text-sm font-medium">Screen Share</span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => {
                          setRemoteStream(null);
                          pcRef.current?.close();
                          pcRef.current = null;
                        }}
                        data-testid="button-close-screen-share"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <video
                      ref={videoRef}
                      autoPlay
                      playsInline
                      className="w-full rounded-md bg-black"
                      data-testid="video-screen-share"
                    />
                  </div>
                )}

                {audioStream && (
                  <div className="p-3 border-b flex items-center gap-2">
                    <Phone className="h-4 w-4 text-green-500" />
                    <span className="text-sm">Voice call active</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={handleToggleMute}
                      data-testid="button-toggle-mute"
                    >
                      {isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                    </Button>
                  </div>
                )}

                <ScrollArea className="flex-1 p-4">
                  <div className="space-y-2">
                    {selectedRequest.message && (
                      <div className="bg-muted rounded-md p-3 text-sm mb-4">
                        <p className="text-xs text-muted-foreground mb-1">Initial message:</p>
                        {selectedRequest.message}
                      </div>
                    )}
                    {localMessages.map((msg) => (
                      <div
                        key={msg.id}
                        className={`flex ${msg.senderRole === "admin" ? "justify-end" : "justify-start"}`}
                        data-testid={`chat-message-${msg.id}`}
                      >
                        <div
                          className={`rounded-md px-3 py-2 text-sm max-w-[80%] ${
                            msg.senderRole === "admin"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {msg.message}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </div>
                </ScrollArea>

                {selectedRequest.status !== "resolved" && (
                  <div className="p-4 border-t flex gap-2">
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
                      data-testid="input-admin-chat"
                    />
                    <Button
                      size="icon"
                      onClick={() => sendMessageMutation.mutate()}
                      disabled={!chatInput.trim() || sendMessageMutation.isPending}
                      data-testid="button-admin-send"
                    >
                      <Send className="h-4 w-4" />
                    </Button>
                  </div>
                )}
              </Card>
            )}
          </div>
        </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}
