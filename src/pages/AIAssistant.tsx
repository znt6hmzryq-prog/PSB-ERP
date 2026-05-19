import { useState, useRef, useEffect } from "react";
import { trpc } from "@/providers/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Brain, Send, Plus, MessageSquare, TrendingUp, AlertTriangle, FileQuestion, Sparkles } from "lucide-react";

const quickPrompts = [
  { icon: TrendingUp, label: "Revenue Forecast", prompt: "What is our projected revenue for Q3 2026?" },
  { icon: AlertTriangle, label: "Anomaly Detection", prompt: "Are there any unusual expense patterns this month?" },
  { icon: FileQuestion, label: "Journal Help", prompt: "How do I record a ticket refund in the journal?" },
  { icon: Sparkles, label: "Customer Insights", prompt: "Analyze our top customers and their booking patterns" },
];

export default function AIAssistantPage() {
  const { data: conversations, refetch } = trpc.ai.conversations.useQuery();
  const sendMessage = trpc.ai.sendMessage.useMutation({
    onSuccess: () => { refetch(); },
    onError: (err) => alert(err.message),
  });
  const createConversation = trpc.ai.createConversation.useMutation({
    onSuccess: (data) => {
      refetch();
      if (data?.id) setActiveConversation(data.id);
    },
    onError: (err) => alert(err.message),
  });

  const [activeConversation, setActiveConversation] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeConv = conversations?.find(c => c.id === activeConversation);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [activeConv?.messages]);

  const handleSend = async () => {
    if (!message.trim() || !activeConversation) return;
    setIsTyping(true);
    try {
      await sendMessage.mutateAsync({ conversationId: activeConversation, content: message });
      setMessage("");
    } catch {
      // error handled by onError
    } finally {
      setIsTyping(false);
    }
  };

  const handleQuickPrompt = async (prompt: string) => {
    if (!activeConversation) return;
    setIsTyping(true);
    try {
      await sendMessage.mutateAsync({ conversationId: activeConversation, content: prompt });
    } catch {
      // error handled by onError
    } finally {
      setIsTyping(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white">AI Assistant</h1>
          <p className="text-slate-500 mt-1 text-sm">Intelligent insights, forecasts, and automation</p>
        </div>
        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogTrigger asChild>
            <Button className="bg-indigo-600 hover:bg-indigo-700 w-full sm:w-auto"><Plus className="h-4 w-4 mr-2" /> New Chat</Button>
          </DialogTrigger>
          <DialogContent className="max-w-[95vw] sm:max-w-md">
            <DialogHeader><DialogTitle>Start New Conversation</DialogTitle></DialogHeader>
            <div className="space-y-4 pt-4">
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="Conversation title..." />
              <Button
                className="w-full bg-indigo-600"
                onClick={() => { createConversation.mutate({ title: newTitle || "New Conversation" }); setCreateOpen(false); setNewTitle(""); }}
                disabled={createConversation.isPending}
              >
                {createConversation.isPending ? "Starting..." : "Start Conversation"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* FIXED: stacked on mobile, side-by-side on lg */}
      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6 h-auto lg:h-[calc(100vh-12rem)]">
        {/* Conversation List */}
        <Card className="border-0 shadow-sm lg:w-72 flex-shrink-0 overflow-hidden">
          <CardContent className="p-0">
            <div className="p-3 border-b font-medium text-sm text-slate-600">Conversations</div>
            <ScrollArea className="h-auto lg:h-[calc(100vh-16rem)]">
              <div className="space-y-1 p-2">
                {(conversations || []).map(conv => (
                  <button
                    key={conv.id}
                    onClick={() => setActiveConversation(conv.id)}
                    className={`w-full text-left p-2 sm:p-3 rounded-lg transition-colors text-sm ${
                      activeConversation === conv.id
                        ? "bg-indigo-50 text-indigo-700 dark:bg-indigo-950/50"
                        : "hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-600"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <MessageSquare className="h-4 w-4 flex-shrink-0" />
                      <span className="font-medium truncate text-xs sm:text-sm">{conv.title}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="secondary" className="text-[10px]">{conv.status}</Badge>
                      <span className="text-[10px] text-slate-400">{conv.messages?.length || 0} msgs</span>
                    </div>
                  </button>
                ))}
                {(!conversations || conversations.length === 0) && (
                  <p className="text-center text-sm text-slate-400 py-8">No conversations yet</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>

        {/* Chat Area */}
        <Card className="border-0 shadow-sm flex-1 flex flex-col overflow-hidden min-h-[400px] lg:min-h-0">
          {activeConv ? (
            <>
              <div className="p-3 sm:p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0">
                    <Brain className="h-4 w-4 text-indigo-600" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-medium text-sm truncate">{activeConv.title}</p>
                    <p className="text-xs text-slate-500">{activeConv.model} • {activeConv.messages?.length || 0} messages</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs flex-shrink-0">{activeConv.status}</Badge>
              </div>

              <div ref={scrollRef} className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-3 sm:space-y-4">
                {(!activeConv.messages || activeConv.messages.length <= 2) && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
                    {quickPrompts.map((prompt) => (
                      <button
                        key={prompt.label}
                        onClick={() => handleQuickPrompt(prompt.prompt)}
                        className="flex items-center gap-2 sm:gap-3 p-2 sm:p-3 rounded-lg border hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-left"
                      >
                        <div className="h-7 w-7 sm:h-8 sm:w-8 rounded-lg bg-indigo-100 flex items-center justify-center flex-shrink-0">
                          <prompt.icon className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-indigo-600" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-xs sm:text-sm font-medium">{prompt.label}</p>
                          <p className="text-[10px] sm:text-xs text-slate-500 truncate">{prompt.prompt}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {(activeConv.messages || []).map((msg, i) => (
                  <div key={i} className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[90%] sm:max-w-[80%] rounded-lg p-2.5 sm:p-3 ${
                      msg.role === "user"
                        ? "bg-indigo-600 text-white"
                        : "bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white"
                    }`}>
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-1 mb-1">
                          <Sparkles className="h-3 w-3 text-indigo-500" />
                          <span className="text-[10px] font-medium text-indigo-500">PSB AI</span>
                        </div>
                      )}
                      <p className="text-xs sm:text-sm whitespace-pre-wrap">{msg.content}</p>
                      {msg.tokensUsed && (
                        <p className="text-[10px] opacity-60 mt-1">{msg.tokensUsed} tokens</p>
                      )}
                    </div>
                  </div>
                ))}

                {isTyping && (
                  <div className="flex justify-start">
                    <div className="bg-slate-100 dark:bg-slate-800 rounded-lg p-2.5 sm:p-3">
                      <div className="flex items-center gap-2">
                        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="h-2 w-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="p-3 sm:p-4 border-t">
                <div className="flex gap-2">
                  <Input
                    value={message}
                    onChange={e => setMessage(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && handleSend()}
                    placeholder="Ask about revenue, expenses, tickets..."
                    className="flex-1 text-sm"
                  />
                  <Button className="bg-indigo-600 flex-shrink-0" onClick={handleSend} disabled={!message.trim() || isTyping}>
                    <Send className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center px-4">
                <div className="h-12 w-12 sm:h-16 sm:w-16 rounded-full bg-indigo-100 flex items-center justify-center mx-auto mb-3 sm:mb-4">
                  <Brain className="h-6 w-6 sm:h-8 sm:w-8 text-indigo-600" />
                </div>
                <h3 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">PSB AI Assistant</h3>
                <p className="text-slate-500 mt-1 max-w-sm text-xs sm:text-sm">Select a conversation or start a new one to get AI-powered insights about your business.</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
