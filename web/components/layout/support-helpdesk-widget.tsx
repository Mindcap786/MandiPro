'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/components/auth/auth-provider';
import { motion } from 'framer-motion';
import { MessageSquarePlus, X, Send, CheckCircle2, Loader2, Sparkles, HelpCircle, CreditCard, Clock, History, PlusCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { formatDistanceToNow } from 'date-fns';

export function SupportHelpdeskWidget() {
    const { profile } = useAuth();
    const [isOpen, setIsOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    
    const [type, setType] = useState('support');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [activeTab, setActiveTab] = useState('new');
    const [tickets, setTickets] = useState<any[]>([]);
    const [fetchingTickets, setFetchingTickets] = useState(false);

    // Draggable position — persisted across reloads so users can park the
    // bubble wherever it doesn't cover menus or content.
    const dragRef = useRef<HTMLDivElement>(null);
    const [dragPos, setDragPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
    useEffect(() => {
        try {
            const saved = localStorage.getItem('mandi_support_widget_pos');
            if (saved) setDragPos(JSON.parse(saved));
        } catch {}
    }, []);

    useEffect(() => {
        if (isOpen && activeTab === 'history' && profile?.organization_id) {
            fetchTickets();
        }
    }, [isOpen, activeTab, profile?.organization_id]);

    const fetchTickets = async () => {
        setFetchingTickets(true);
        try {
            const { data, error } = await supabase
                .schema('core')
                .from('support_tickets')
                .select('*')
                .eq('organization_id', profile.organization_id)
                .order('created_at', { ascending: false })
                .limit(10);

            if (error) throw error;
            setTickets(data || []);
        } catch (error) {
            console.error('Error fetching tickets:', error);
        } finally {
            setFetchingTickets(false);
        }
    };

    if (profile?.role === 'super_admin') return null; // Don't show to super admins

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!message.trim() || !profile?.organization_id) return;

        setLoading(true);
        try {
            const { error } = await supabase.schema('core').from('support_tickets').insert({
                organization_id: profile.organization_id,
                user_id: profile.id,
                ticket_type: type,
                subject: subject || 'General Query',
                message: message
            });

            if (error) throw error;
            
            setSuccess(true);
            setTimeout(() => {
                setIsOpen(false);
                setSuccess(false);
                setMessage('');
                setSubject('');
                setType('support');
            }, 3000);
        } catch (error: any) {
            console.error('Error submitting ticket:', error);
            toast.error('Failed to send message', { description: 'Please try again later or contact your account manager directly.' });
        } finally {
            setLoading(false);
        }
    };

    return (
        <motion.div
            ref={dragRef}
            drag
            dragMomentum={false}
            dragElastic={0.1}
            dragConstraints={{
                left: -(typeof window !== 'undefined' ? window.innerWidth - 90 : 0),
                right: 0,
                top: -(typeof window !== 'undefined' ? window.innerHeight - 200 : 0),
                bottom: 0,
            }}
            initial={false}
            animate={{ x: dragPos.x, y: dragPos.y }}
            onDragEnd={(_, info) => {
                const next = { x: dragPos.x + info.offset.x, y: dragPos.y + info.offset.y };
                setDragPos(next);
                try { localStorage.setItem('mandi_support_widget_pos', JSON.stringify(next)); } catch {}
            }}
            className="fixed bottom-[90px] lg:bottom-6 right-4 z-[100] print:hidden cursor-grab active:cursor-grabbing"
            style={{ touchAction: "none" }}
        >
            {/* Expanded Chat Box */}
            <div className={cn(
                "absolute bottom-20 right-0 w-[340px] bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden origin-bottom-right transition-all duration-300 pointer-events-none opacity-0 scale-95",
                isOpen && "pointer-events-auto opacity-100 scale-100"
            )}>
                {/* Header */}
                <div className="bg-indigo-600 text-white p-4 flex items-center justify-between">
                    <div>
                        <h3 className="font-black text-sm tracking-tight flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                            Live Support Hub
                        </h3>
                        <p className="text-[10px] text-indigo-100 mt-1">We usually respond within 24 hours.</p>
                    </div>
                    <button onClick={() => setIsOpen(false)} className="text-white/70 hover:text-white transition-colors p-1">
                        <X className="w-4 h-4" />
                    </button>
                </div>

                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                    <TabsList className="w-full bg-slate-100 rounded-none p-1 h-10 border-b border-slate-200">
                        <TabsTrigger value="new" className="flex-1 text-[10px] font-black uppercase tracking-widest gap-2 data-[state=active]:bg-white">
                            <PlusCircle className="w-3 h-3" /> New Ticket
                        </TabsTrigger>
                        <TabsTrigger value="history" className="flex-1 text-[10px] font-black uppercase tracking-widest gap-2 data-[state=active]:bg-white relative">
                            <History className="w-3 h-3" /> My Tickets
                            {tickets.some(t => t.status === 'in_progress') && (
                                <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 bg-amber-500 rounded-full animate-pulse" />
                            )}
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="new" className="m-0">
                        {success ? (
                            <div className="p-8 flex flex-col items-center justify-center text-center space-y-3 bg-slate-50 h-[320px]">
                                <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mb-2">
                                    <CheckCircle2 className="w-6 h-6" />
                                </div>
                                <h4 className="font-black text-slate-800">Message Sent!</h4>
                                <p className="text-xs text-slate-500">Our team has received your request and will follow up shortly.</p>
                                <Button variant="link" onClick={() => { setSuccess(false); setActiveTab('history'); }} className="text-xs text-indigo-600 font-bold">
                                    View Ticket Status
                                </Button>
                            </div>
                        ) : (
                            <form onSubmit={handleSubmit} className="p-4 bg-slate-50 flex flex-col gap-3 h-[360px] overflow-y-auto">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">How can we help?</label>
                                    <Select value={type} onValueChange={setType}>
                                        <SelectTrigger className="bg-white border-slate-200 h-9 text-xs font-medium">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="support">
                                                <div className="flex items-center gap-2 text-xs font-medium">
                                                    <HelpCircle className="w-3 h-3 text-blue-500" /> Technical Support
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="feature_request">
                                                <div className="flex items-center gap-2 text-xs font-medium text-purple-600">
                                                    <Sparkles className="w-3 h-3" /> New Feature Request
                                                </div>
                                            </SelectItem>
                                            <SelectItem value="billing">
                                                <div className="flex items-center gap-2 text-xs font-medium text-emerald-600">
                                                    <CreditCard className="w-3 h-3" /> Billing / Upgrade
                                                </div>
                                            </SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Subject <span className="text-slate-400 font-normal">(Optional)</span></label>
                                    <Input 
                                        value={subject} 
                                        onChange={e => setSubject(e.target.value)} 
                                        placeholder="E.g., Need help with POS" 
                                        className="bg-white border-slate-200 h-9 text-xs"
                                    />
                                </div>

                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Message <span className="text-red-500">*</span></label>
                                    <Textarea 
                                        value={message} 
                                        onChange={e => setMessage(e.target.value)} 
                                        placeholder="Explain your query in detail..." 
                                        className="bg-white border-slate-200 resize-none h-24 text-xs"
                                        required
                                    />
                                </div>

                                <Button 
                                    type="submit" 
                                    disabled={!message.trim() || loading} 
                                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold h-10 mt-1"
                                >
                                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                                        <>
                                            <Send className="w-4 h-4 mr-2" /> Send Message
                                        </>
                                    )}
                                </Button>
                            </form>
                        )}
                    </TabsContent>

                    <TabsContent value="history" className="m-0 bg-slate-50 h-[360px] overflow-y-auto custom-scrollbar">
                        {fetchingTickets ? (
                            <div className="p-12 flex flex-col items-center justify-center gap-3">
                                <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Refreshing...</p>
                            </div>
                        ) : tickets.length === 0 ? (
                            <div className="p-12 flex flex-col items-center justify-center text-center gap-3 h-full">
                                <History className="w-8 h-8 text-slate-200" />
                                <p className="text-xs text-slate-400 font-medium">No previous support requests found.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {tickets.map(ticket => (
                                    <div key={ticket.id} className="p-4 hover:bg-white transition-colors space-y-2">
                                        <div className="flex items-start justify-between gap-2">
                                            <h4 className="text-xs font-black text-slate-800 line-clamp-1">{ticket.subject}</h4>
                                            <Badge className={cn(
                                                "text-[8px] font-black px-1.5 py-0 h-4 border-none shadow-none uppercase tracking-tighter",
                                                ticket.status === 'open' && "bg-rose-50 text-rose-600",
                                                ticket.status === 'in_progress' && "bg-amber-50 text-amber-600",
                                                ticket.status === 'resolved' && "bg-emerald-50 text-emerald-600",
                                                ticket.status === 'closed' && "bg-slate-100 text-slate-500"
                                            )}>
                                                {ticket.status.replace('_', ' ')}
                                            </Badge>
                                        </div>
                                        <p className="text-[10px] text-slate-500 line-clamp-2 leading-relaxed">
                                            {ticket.message}
                                        </p>
                                        
                                        {ticket.admin_notes && (
                                            <div className="bg-indigo-50/50 rounded-lg p-2 border border-indigo-100/50">
                                                <div className="flex items-center gap-1.5 mb-1">
                                                    <span className="w-1 h-1 rounded-full bg-indigo-400" />
                                                    <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest">Team Response</span>
                                                </div>
                                                <p className="text-[10px] font-bold text-indigo-700 italic">
                                                    "{ticket.admin_notes}"
                                                </p>
                                            </div>
                                        )}

                                        <div className="flex items-center gap-1.5 text-[9px] font-bold text-slate-400">
                                            <Clock className="w-3 h-3" />
                                            {formatDistanceToNow(new Date(ticket.created_at), { addSuffix: true })}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </TabsContent>
                </Tabs>
            </div>

            {/* Bubble Toggle */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all duration-300 hover:scale-110 active:scale-95",
                    isOpen ? "bg-slate-800 text-white rotate-90" : "bg-indigo-600 text-white hover:bg-indigo-700 hover:shadow-indigo-500/30"
                )}
            >
                {isOpen ? <X className="w-6 h-6 -rotate-90 transition-transform duration-300" /> : <MessageSquarePlus className="w-6 h-6" />}
            </button>
        </motion.div>
    );
}
