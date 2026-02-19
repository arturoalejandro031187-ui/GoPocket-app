'use client';

import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { Radio, Video, VideoOff, Send, Users, Clock, ShoppingBag, Crown, AlertTriangle, Eye } from 'lucide-react';

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
    const [cameraActive, setCameraActive] = useState(false);
    const [pastSessions, setPastSessions] = useState<any[]>([]);
    const [error, setError] = useState('');
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const getToken = async () => {
        const { data } = await supabase.auth.getSession();
        return data.session?.access_token;
    };

    useEffect(() => {
        const load = async () => {
            const { data: { user } } = await supabase.auth.getUser();
            if (!user) return;

            // Get plan
            const { data: profile } = await supabase.from('profiles').select('plan_type').eq('id', user.id).single();
            setPlan(profile?.plan_type || 'basic');

            // Get listings for product selection via server API (bypasses RLS)
            const token = await getToken();
            if (token) {
                const listingsRes = await fetch('/api/user/my-listings', {
                    headers: { authorization: `Bearer ${token}` },
                });
                const listingsData = await listingsRes.json();
                console.log('[Live] Listings loaded:', listingsData);
                setMyListings(listingsData.listings || []);
            }

            // Get active session
            if (token) {
                const res = await fetch(`/api/live?status=live&host_id=${user.id}`, {
                    headers: { authorization: `Bearer ${token}` },
                });
                const data = await res.json();
                if (data.sessions?.length > 0) {
                    setActiveSession(data.sessions[0]);
                }

                // Past sessions
                const pastRes = await fetch(`/api/live?status=ended&host_id=${user.id}`, {
                    headers: { authorization: `Bearer ${token}` },
                });
                const pastData = await pastRes.json();
                setPastSessions(pastData.sessions || []);
            }

            setLoading(false);
        };
        load();
    }, []);

    const startCamera = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 720 } },
                audio: true
            });
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
            }
            streamRef.current = stream;
            setCameraActive(true);
        } catch (err) {
            setError('No se pudo acceder a la cámara. Verifica los permisos.');
        }
    };

    const stopCamera = () => {
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(t => t.stop());
            streamRef.current = null;
        }
        if (videoRef.current) videoRef.current.srcObject = null;
        setCameraActive(false);
    };

    const startLive = async () => {
        if (!title.trim()) { setError('Escribe un título para tu live'); return; }
        setStarting(true);
        setError('');
        try {
            const token = await getToken();
            if (!token) throw new Error('No auth');

            const res = await fetch('/api/live', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({
                    title: title.trim(),
                    description: description.trim() || null,
                    product_ids: selectedProducts,
                }),
            });

            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Error al iniciar');
            setActiveSession(data.session);
            if (!cameraActive) await startCamera();
        } catch (err: any) {
            setError(err.message);
        }
        setStarting(false);
    };

    const endLive = async () => {
        if (!activeSession || !confirm('¿Seguro que quieres terminar la transmisión?')) return;
        setEnding(true);
        try {
            const token = await getToken();
            await fetch('/api/live', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json', authorization: `Bearer ${token}` },
                body: JSON.stringify({ session_id: activeSession.id, action: 'end' }),
            });
            stopCamera();
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

    // Gate: must be platinum
    if (plan !== 'platinum') {
        return (
            <div className="max-w-2xl mx-auto py-16 px-4 text-center">
                <Crown className="w-16 h-16 text-amber-400 mx-auto mb-4" />
                <h1 className="text-2xl font-bold text-gray-900 mb-3">GoPocket Live es exclusivo de Platinum</h1>
                <p className="text-gray-600 mb-6">
                    Transmite en vivo, muestra productos y vende directamente a tu audiencia.
                    Disponible solo para vendedores con Plan Platinum.
                </p>
                <Link
                    href="/dashboard/pro"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-white font-bold px-8 py-3 rounded-xl shadow-lg hover:from-amber-600 hover:to-yellow-600 transition-all"
                >
                    <Crown className="w-5 h-5" />
                    Obtener Plan Platinum — $999/mes
                </Link>
            </div>
        );
    }

    return (
        <div className="max-w-5xl mx-auto py-8 px-4">
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
                    <Link
                        href={`/live/${activeSession.id}`}
                        target="_blank"
                        className="ml-auto flex items-center gap-1.5 bg-red-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:bg-red-600 transition-colors"
                    >
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

            {/* Active Session */}
            {activeSession ? (
                <div className="rounded-2xl border-2 border-red-200 bg-red-50 p-6 mb-8">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="flex items-center gap-1.5 bg-red-600 text-white text-sm font-bold px-3 py-1.5 rounded-lg">
                            <div className="w-2 h-2 bg-white rounded-full animate-pulse" />
                            EN VIVO
                        </div>
                        <h2 className="text-lg font-bold text-gray-900">{activeSession.title}</h2>
                    </div>

                    {/* Camera preview */}
                    <div className="rounded-xl overflow-hidden bg-gray-900 aspect-video mb-4 relative">
                        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                        {!cameraActive && (
                            <div className="absolute inset-0 flex items-center justify-center">
                                <button onClick={startCamera} className="bg-white text-gray-900 font-bold px-6 py-3 rounded-xl flex items-center gap-2 hover:bg-gray-100 transition-colors">
                                    <Video className="w-5 h-5" /> Activar cámara
                                </button>
                            </div>
                        )}
                        <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-black/60 backdrop-blur-sm text-white text-sm px-2.5 py-1 rounded-lg">
                            <Users className="w-4 h-4" />
                            {activeSession.viewer_count || 0}
                        </div>
                    </div>

                    <div className="flex gap-3">
                        {cameraActive && (
                            <button onClick={stopCamera} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gray-200 text-gray-700 font-semibold text-sm hover:bg-gray-300 transition-colors">
                                <VideoOff className="w-4 h-4" /> Apagar cámara
                            </button>
                        )}
                        <button
                            onClick={endLive}
                            disabled={ending}
                            className="flex items-center gap-2 px-6 py-2 rounded-xl bg-red-600 text-white font-bold text-sm hover:bg-red-700 transition-colors ml-auto"
                        >
                            {ending ? 'Finalizando...' : '⏹ Finalizar transmisión'}
                        </button>
                    </div>
                </div>
            ) : (
                /* New Session Form */
                <div className="rounded-2xl border border-gray-200 bg-white p-6 mb-8 shadow-sm">
                    <h2 className="text-lg font-bold text-gray-900 mb-4">Nueva transmisión</h2>

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
                        <div>
                            <label className="block text-sm font-semibold text-gray-700 mb-2">
                                <ShoppingBag className="inline w-4 h-4 mr-1 text-red-400" />
                                Productos a mostrar ({selectedProducts.length} seleccionados)
                            </label>
                            {myListings.length > 0 ? (
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 max-h-48 overflow-y-auto">
                                    {myListings.map((listing) => (
                                        <button
                                            key={listing.id}
                                            type="button"
                                            onClick={() => {
                                                setSelectedProducts((prev) =>
                                                    prev.includes(listing.id)
                                                        ? prev.filter((id) => id !== listing.id)
                                                        : [...prev, listing.id]
                                                );
                                            }}
                                            className={`flex items-center gap-2 p-2 rounded-lg border text-left text-xs transition-all ${selectedProducts.includes(listing.id)
                                                ? 'border-red-400 bg-red-50 ring-1 ring-red-400'
                                                : 'border-gray-200 hover:border-gray-300'
                                                }`}
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
                            ) : (
                                <div className="rounded-xl border-2 border-dashed border-gray-300 p-6 text-center">
                                    <ShoppingBag className="w-8 h-8 text-gray-300 mx-auto mb-2" />
                                    <p className="text-sm text-gray-500 mb-2">No tienes productos publicados</p>
                                    <Link href="/dashboard/listings/new" className="text-sm text-red-500 font-semibold hover:underline">
                                        + Publicar un producto
                                    </Link>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Camera preview before going live */}
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
                    <div className="flex gap-3 mb-4">
                        <button
                            type="button"
                            onClick={() => {
                                const params = new URLSearchParams();
                                if (title.trim()) params.set('title', title.trim());
                                if (description.trim()) params.set('description', description.trim());
                                if (selectedProducts.length > 0) params.set('products', selectedProducts.join(','));
                                window.open(`/live/preview?${params.toString()}`, '_blank');
                            }}
                            className="flex-1 flex items-center justify-center gap-2 border-2 border-gray-300 text-gray-700 font-bold py-3.5 rounded-xl text-sm hover:border-gray-400 hover:bg-gray-50 transition-all"
                        >
                            <Eye className="w-5 h-5" />
                            Vista Previa
                        </button>
                        <button
                            onClick={startLive}
                            disabled={starting || !title.trim()}
                            className="flex-[2] bg-gradient-to-r from-red-600 to-red-500 text-white font-bold py-3.5 rounded-xl text-sm hover:from-red-700 hover:to-red-600 transition-all shadow-lg shadow-red-200 disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {starting ? (
                                <div className="h-5 w-5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                            ) : (
                                <>
                                    <Radio className="w-5 h-5" />
                                    Iniciar Transmisión en Vivo
                                </>
                            )}
                        </button>
                    </div>
                </div>
            )}

            {/* Past sessions */}
            {pastSessions.length > 0 && (
                <div>
                    <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
                        <Clock className="w-5 h-5 text-gray-400" />
                        Transmisiones anteriores
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
                                        {' · '}
                                        <Users className="inline w-3 h-3" /> {s.viewer_count || 0} viewers
                                        {s.product_ids?.length > 0 && <> · <ShoppingBag className="inline w-3 h-3" /> {s.product_ids.length} productos</>}
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
