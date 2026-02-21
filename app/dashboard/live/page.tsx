'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import {
    Radio, Video, VideoOff, Send, Users, Clock,
    ShoppingBag, Crown, AlertTriangle, Eye, Mic, MicOff,
    Copy, Check, Monitor, Globe, ExternalLink
} from 'lucide-react';
import {
    LiveKitRoom,
    useTracks,
    VideoTrack,
    useLocalParticipant,
} from '@livekit/components-react';
import '@livekit/components-styles';
import { Track } from 'livekit-client';

// ─── LiveKit broadcaster inner component ─────────────────────────────────────
function BroadcastControls({
    onEnd, ending, viewerCount,
}: { onEnd: () => void; ending: boolean; viewerCount: number }) {
    const { localParticipant } = useLocalParticipant();
    const tracks = useTracks([Track.Source.Camera], { onlySubscribed: false });
    const [cameraOn, setCameraOn] = useState(true);
    const [micOn, setMicOn] = useState(true);

    const toggleCamera = useCallback(async () => {
        await localParticipant.setCameraEnabled(!cameraOn);
        setCameraOn((v) => !v);
    }, [cameraOn, localParticipant]);

    const toggleMic = useCallback(async () => {
        await localParticipant.setMicrophoneEnabled(!micOn);
        setMicOn((v) => !v);
    }, [micOn, localParticipant]);

    const localTrack = tracks.find((t) => t.participant.isLocal);

    return (
        <div>
            <div className="rounded-xl overflow-hidden bg-gray-900 aspect-video mb-4 relative">
                {localTrack ? (
                    <VideoTrack trackRef={localTrack} className="w-full h-full object-cover" />
                ) : (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <VideoOff className="w-12 h-12 text-gray-600" />
                    </div>
                )}
                <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-sm px-2.5 py-1 rounded-lg">
                    <Users className="w-4 h-4" />{viewerCount}
                </div>
                <div className="absolute top-3 left-3 flex items-center gap-1.5 bg-red-600/90 text-white text-xs font-bold px-2.5 py-1 rounded-lg">
                    <div className="w-2 h-2 bg-white rounded-full animate-pulse" />EN VIVO
                </div>
            </div>
            <div className="flex gap-3 items-center">
                <button onClick={toggleCamera} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-colors ${cameraOn ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                    {cameraOn ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                    {cameraOn ? 'Cámara' : 'Cámara off'}
                </button>
                <button onClick={toggleMic} className={`flex items-center gap-2 px-4 py-2 rounded-xl font-semibold text-sm transition-colors ${micOn ? 'bg-gray-200 text-gray-700 hover:bg-gray-300' : 'bg-red-100 text-red-700 hover:bg-red-200'}`}>
                    {micOn ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4" />}
                    {micOn ? 'Micro' : 'Micro off'}
                </button>
                <button onClick={onEnd} disabled={ending} className="flex items-center gap-2 px-6 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors ml-auto">
                    {ending ? 'Finalizando...' : '⏹ Finalizar transmisión'}
                </button>
            </div>
        </div>
    );
}

// ─── Copy to clipboard button ─────────────────────────────────────────────────
function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const handleCopy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };
    return (
        <button onClick={handleCopy} className={`p-2 rounded-lg transition-colors ${copied ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}>
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
        </button>
    );
}

// ─── OBS Active Session Panel ─────────────────────────────────────────────────
function OBSActivePanel({ rtmpUrl, streamKey, onEnd, ending, viewerCount }: {
    rtmpUrl: string; streamKey: string; onEnd: () => void; ending: boolean; viewerCount: number;
}) {
    return (
        <div>
            {/* Status header */}
            <div className="flex items-center gap-3 mb-5 p-3 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex items-center gap-2 text-green-700 font-semibold text-sm">
                    <div className="w-2.5 h-2.5 bg-green-500 rounded-full animate-pulse" />
                    OBS conectado — esperando señal
                </div>
                <div className="ml-auto flex items-center gap-1.5 text-sm text-gray-600">
                    <Users className="w-4 h-4" />{viewerCount} viendo
                </div>
            </div>

            {/* RTMP Credentials */}
            <div className="space-y-3 mb-5">
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">RTMP Server URL</label>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <code className="flex-1 text-xs text-gray-800 font-mono break-all">{rtmpUrl}</code>
                        <CopyButton text={rtmpUrl} />
                    </div>
                </div>
                <div>
                    <label className="block text-xs font-semibold text-gray-500 mb-1">Stream Key (no compartas)</label>
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                        <code className="flex-1 text-xs text-gray-800 font-mono break-all select-all">{streamKey}</code>
                        <CopyButton text={streamKey} />
                    </div>
                </div>
            </div>

            {/* OBS Quick Setup */}
            <details className="mb-5">
                <summary className="cursor-pointer text-sm font-semibold text-gray-700 hover:text-gray-900 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4" />
                    Cómo configurar en OBS Studio
                </summary>
                <div className="mt-3 space-y-2 text-xs text-gray-600 bg-gray-50 rounded-xl p-4">
                    <p className="font-semibold text-gray-800">Pasos en OBS Studio:</p>
                    <ol className="list-decimal list-inside space-y-1.5">
                        <li>Abre OBS Studio → <strong>Configuración → Emisión</strong></li>
                        <li>Servicio: selecciona <strong>"Personalizado..."</strong></li>
                        <li>Pega la <strong>URL del servidor</strong> de arriba</li>
                        <li>Pega la <strong>Clave de Stream</strong> de arriba</li>
                        <li>Guarda y haz clic en <strong>"Iniciar transmisión"</strong> en OBS</li>
                    </ol>
                    <p className="mt-2 text-amber-700 font-medium">⚠️ Tu señal tarda ~5 segundos en aparecer para los viewers.</p>
                </div>
            </details>

            <button onClick={onEnd} disabled={ending} className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors">
                {ending ? 'Finalizando...' : '⏹ Finalizar transmisión'}
            </button>
        </div>
    );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function LiveDashboard() {
    const [plan, setPlan] = useState<string>('basic');
    const [loading, setLoading] = useState(true);
    const [activeSession, setActiveSession] = useState<any>(null);
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
    const [myListings, setMyListings] = useState<any[]>([]);
    const [starting, setStarting] = useState(false);
    const [ending, setEnding] = useState(false);
    const [pastSessions, setPastSessions] = useState<any[]>([]);
    const [error, setError] = useState('');

    // Broadcast mode
    const [broadcastMode, setBroadcastMode] = useState<'browser' | 'obs'>('browser');

    // Browser LiveKit state
    const [livekitToken, setLivekitToken] = useState<string | null>(null);
    const [livekitUrl, setLivekitUrl] = useState<string>('');

    // OBS ingress state
    const [ingressData, setIngressData] = useState<{ rtmp_url: string; stream_key: string; ingress_id: string } | null>(null);

    // Local camera preview (before going live in browser mode)
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const [cameraActive, setCameraActive] = useState(false);

    const getSupabaseToken = async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    };

    useEffect(() => {
        const load = async () => {
            try {
                const { data: { user } } = await supabase.auth.getUser();
                if (!user) { setLoading(false); return; }

                const { data: profile } = await supabase.from('profiles').select('plan_type').eq('id', user.id).single();
                setPlan(profile?.plan_type || 'basic');

                const token = await getSupabaseToken();
                if (token) {
                    try {
                        const listingsRes = await fetch('/api/user/my-listings', { headers: { authorization: `Bearer ${token}` } });
                        const listingsData = await listingsRes.json();
                        setMyListings(listingsData.listings || []);
                    } catch { }

                    try {
                        const res = await fetch(`/api/live?status=live&host_id=${user.id}`, { headers: { authorization: `Bearer ${token}` } });
                        const data = await res.json();
                        if (data.sessions?.length > 0) {
                            const session = data.sessions[0];
                            setActiveSession(session);
                            await fetchLivekitToken(session.id);
                        }
                    } catch { }

                    try {
                        const pastRes = await fetch(`/api/live?status=ended&host_id=${user.id}`, { headers: { authorization: `Bearer ${token}` } });
                        const pastData = await pastRes.json();
                        setPastSessions(pastData.sessions || []);
                    } catch { }
                }
            } catch (e: any) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const fetchLivekitToken = async (roomId: string) => {
        try {
            const res = await fetch(`/api/live/token?room=${roomId}&host=true`);
            const data = await res.json();
            if (data.token) { setLivekitToken(data.token); setLivekitUrl(data.url); }
        } catch { }
    };

    const fetchIngress = async (sessionId: string) => {
        try {
            const token = await getSupabaseToken();
            const res = await fetch('/api/live/ingress', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ session_id: sessionId }),
            });
            const data = await res.json();
            if (data.rtmp_url) {
                setIngressData({ rtmp_url: data.rtmp_url, stream_key: data.stream_key, ingress_id: data.ingress_id });
            }
        } catch (e) {
            console.error('[Ingress] Error:', e);
        }
    };

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } }, audio: true });
            if (videoRef.current) videoRef.current.srcObject = stream;
            streamRef.current = stream;
            setCameraActive(true);
        } catch {
            setError('No se pudo acceder a la cámara. Verifica los permisos.');
        }
    };

    const stopCamera = () => {
        if (streamRef.current) { streamRef.current.getTracks().forEach(t => t.stop()); streamRef.current = null; }
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
    };

    const startLive = async () => {
        if (!title.trim()) { setError('Escribe un título para tu live'); return; }
        setStarting(true); setError('');
        try {
            const token = await getSupabaseToken();
            if (!token) throw new Error('No auth');

            const res = await fetch('/api/live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ title: title.trim(), description: description.trim() || null, product_ids: selectedProducts }),
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al iniciar');

            stopCamera();
            setActiveSession(data.session);

            if (broadcastMode === 'browser') {
                await fetchLivekitToken(data.session.id);
            } else {
                // OBS mode: generate RTMP ingress
                await fetchIngress(data.session.id);
            }
        } catch (err: any) { setError(err.message); }
        setStarting(false);
    };

    const endLive = async () => {
        if (!activeSession || !confirm('¿Seguro que quieres terminar la transmisión?')) return;
        setEnding(true);
        try {
            const token = await getSupabaseToken();
            await fetch('/api/live', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ session_id: activeSession.id, action: 'end' }),
            });
            // Clean up ingress if OBS mode
            if (ingressData?.ingress_id) {
                await fetch(`/api/live/ingress?ingress_id=${ingressData.ingress_id}`, {
                    method: 'DELETE',
                    headers: { authorization: `Bearer ${token}` },
                }).catch(() => { });
            }
            setLivekitToken(null);
            setIngressData(null);
            setActiveSession(null);
            window.location.reload();
        } catch { }
        setEnding(false);
    };

    if (loading) {
        return (
            <div className="p-8 text-center text-gray-500">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent mx-auto mb-3" />
                Cargando...
            </div>
        );
    }

    if (plan !== 'platinum') {
        return (
            <div className="max-w-2xl mx-auto py-16 px-4 text-center">
                <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-3">GoPocket Live es exclusivo de Platinum</h1>
                <p className="text-gray-600 mb-6">Transmite en vivo, muestra productos y vende directamente a tu audiencia.</p>
                <Link href="/dashboard/pro" className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg hover:from-amber-600 hover:to-yellow-600 transition-all">
                    <Crown className="w-5 h-5" /> Obtener Plan Platinum — $999/mes
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-8">
                <div className="relative">
                    <Radio className="w-8 h-8 text-red-500" />
                    {activeSession && <div className="absolute -top-0.5 -right-0.5 w-3 h-3 bg-red-500 rounded-full animate-ping" />}
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-gray-900">GoPocket Live</h1>
                    <p className="text-gray-500 text-sm">Transmite en vivo y vende directamente</p>
                </div>
                {activeSession && (
                    <Link href={`/live/${activeSession.id}`} target="_blank" className="ml-auto flex items-center gap-1.5 bg-red-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-red-600 transition-colors">
                        <Radio className="w-4 h-4" /> Ver mi live
                    </Link>
                )}
            </div>

            {error && (
                <div className="mb-6 flex items-center gap-2 rounded-xl bg-red-50 border border-red-200 p-3 text-red-700 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    {error}
                    <button onClick={() => setError('')} className="ml-auto text-red-400 hover:text-red-600">✕</button>
                </div>
            )}

            {/* ── Active Session ── */}
            {activeSession ? (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 mb-8">
                    <div className="flex items-center gap-3 mb-5">
                        <div className="flex items-center gap-1.5 bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" /> EN VIVO
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">{activeSession.title}</h2>
                        <div className="ml-auto flex items-center gap-1.5 text-xs bg-gray-100 text-gray-600 px-2.5 py-1 rounded-full">
                            {broadcastMode === 'obs' ? <Monitor className="w-3.5 h-3.5" /> : <Globe className="w-3.5 h-3.5" />}
                            {broadcastMode === 'obs' ? 'OBS Studio' : 'Navegador'}
                        </div>
                    </div>

                    {broadcastMode === 'obs' ? (
                        ingressData ? (
                            <OBSActivePanel
                                rtmpUrl={ingressData.rtmp_url}
                                streamKey={ingressData.stream_key}
                                onEnd={endLive}
                                ending={ending}
                                viewerCount={activeSession.viewer_count || 0}
                            />
                        ) : (
                            <div className="flex items-center gap-3 text-sm text-gray-500">
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-red-500 border-t-transparent" />
                                Generando credenciales RTMP...
                            </div>
                        )
                    ) : (
                        livekitToken ? (
                            <LiveKitRoom video={true} audio={true} token={livekitToken} serverUrl={livekitUrl} style={{ height: 'auto', background: 'transparent' }}>
                                <BroadcastControls onEnd={endLive} ending={ending} viewerCount={activeSession.viewer_count || 0} />
                            </LiveKitRoom>
                        ) : (
                            <div className="rounded-xl bg-gray-900 aspect-video flex items-center justify-center mb-4">
                                <div className="h-8 w-8 animate-spin rounded-full border-4 border-red-500 border-t-transparent" />
                            </div>
                        )
                    )}
                </div>
            ) : (
                /* ── New Session Form ── */
                <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-8 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-5">Nueva transmisión</h2>

                    {/* Broadcast Mode Selector */}
                    <div className="mb-5">
                        <p className="text-sm font-semibold text-gray-700 mb-2">Modo de transmisión</p>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setBroadcastMode('browser')}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${broadcastMode === 'browser' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${broadcastMode === 'browser' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                    <Globe className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className={`text-sm font-bold ${broadcastMode === 'browser' ? 'text-red-700' : 'text-gray-700'}`}>Cámara web</p>
                                    <p className="text-[11px] text-gray-500">Directamente desde el navegador</p>
                                </div>
                            </button>
                            <button
                                type="button"
                                onClick={() => setBroadcastMode('obs')}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 text-left transition-all ${broadcastMode === 'obs' ? 'border-red-500 bg-red-50' : 'border-gray-200 hover:border-gray-300'}`}
                            >
                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center ${broadcastMode === 'obs' ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-500'}`}>
                                    <Monitor className="w-5 h-5" />
                                </div>
                                <div>
                                    <p className={`text-sm font-bold ${broadcastMode === 'obs' ? 'text-red-700' : 'text-gray-700'}`}>OBS Studio</p>
                                    <p className="text-[11px] text-gray-500">Calidad profesional con RTMP</p>
                                </div>
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4 mb-6">
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Título *</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                placeholder="Ej: ¡Ofertas de Viernes! 🔥"
                                maxLength={100}
                                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-1">Descripción (opcional)</label>
                            <textarea
                                value={description}
                                onChange={(e) => setDescription(e.target.value)}
                                placeholder="Describe de qué tratará tu live..."
                                maxLength={500}
                                rows={2}
                                className="w-full rounded-xl border border-gray-300 px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none"
                            />
                        </div>

                        {/* Product selection */}
                        {myListings.length > 0 && (
                            <div>
                                <label className="block text-sm font-semibold text-gray-700 mb-2">
                                    <ShoppingBag className="inline w-4 h-4 mr-1 text-red-400" />
                                    Productos ({selectedProducts.length} seleccionados)
                                </label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                    {myListings.map((listing) => (
                                        <button
                                            key={listing.id}
                                            type="button"
                                            onClick={() => setSelectedProducts((prev) => prev.includes(listing.id) ? prev.filter((id) => id !== listing.id) : [...prev, listing.id])}
                                            className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${selectedProducts.includes(listing.id) ? 'border-red-400 bg-red-50 ring-1 ring-red-400' : 'border-gray-200 hover:border-gray-300'}`}
                                        >
                                            <div className="w-10 h-10 rounded bg-gray-100 flex-shrink-0 overflow-hidden">
                                                {listing.images?.[0] && <img src={listing.images[0]} alt="" className="w-full h-full object-cover" />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-medium text-gray-900 truncate">{listing.title}</p>
                                                <p className="text-red-500 font-bold">${listing.price?.toLocaleString('es-MX')}</p>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Preview (browser mode only) */}
                    {broadcastMode === 'browser' && (
                        <div className="rounded-xl overflow-hidden bg-gray-900 aspect-video mb-4 relative">
                            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                            {!cameraActive && (
                                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                                    <Video className="w-12 h-12 text-gray-600" />
                                    <button onClick={startCamera} className="bg-white text-gray-900 font-bold px-5 py-2 rounded-xl text-sm flex items-center gap-2 hover:bg-gray-100 transition-colors">
                                        <Video className="w-4 h-4" /> Vista previa de cámara
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* OBS info banner */}
                    {broadcastMode === 'obs' && (
                        <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                            <div className="flex items-start gap-2">
                                <Monitor className="w-5 h-5 mt-0.5 shrink-0" />
                                <div>
                                    <p className="font-bold mb-1">Flujo con OBS Studio</p>
                                    <p className="text-[13px]">Al iniciar se generará un <strong>URL RTMP + Clave de Stream</strong> que copias en OBS Studio. Los viewers verán tu transmisión en tiempo real con calidad profesional.</p>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex gap-3">
                        {broadcastMode === 'browser' && (
                            <button
                                type="button"
                                onClick={() => {
                                    const params = new URLSearchParams();
                                    if (title.trim()) params.set('title', title.trim());
                                    window.open(`/live/preview?${params.toString()}`, '_blank');
                                }}
                                className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-700 font-bold py-3.5 rounded-xl text-sm hover:border-gray-400 hover:bg-gray-50 transition-all"
                            >
                                <Eye className="w-5 h-5" /> Vista Previa
                            </button>
                        )}
                        <button
                            onClick={startLive}
                            disabled={starting || !title.trim()}
                            className={`${broadcastMode === 'browser' ? 'flex-[2]' : 'w-full'} bg-gradient-to-r from-red-600 to-red-500 text-white font-bold py-3.5 rounded-xl text-sm hover:from-red-700 hover:to-red-600 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2`}
                        >
                            {starting ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : broadcastMode === 'obs' ? (
                                <><Monitor className="w-5 h-5" /> Iniciar y Obtener Credenciales RTMP</>
                            ) : (
                                <><Radio className="w-5 h-5" /> Iniciar Transmisión en Vivo</>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Past sessions */}
            {pastSessions.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-400" /> Transmisiones anteriores
                    </h2>
                    <div className="space-y-3">
                        {pastSessions.map((s) => (
                            <div key={s.id} className="flex items-center gap-4 rounded-xl border border-gray-200 p-4 bg-white hover:shadow-sm transition-shadow">
                                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center text-gray-400">
                                    <Radio className="w-5 h-5" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">{s.title}</p>
                                    <p className="text-xs text-gray-500">
                                        {new Date(s.started_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })}
                                        {' · '}<Users className="inline w-3 h-3" /> {s.viewer_count || 0} viewers
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}
