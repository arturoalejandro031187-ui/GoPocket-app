'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase/client';
import Link from 'next/link';
import { SecurityAlert, SecuritySeverity, SecurityStatus, UserIP } from '@/lib/security/types';
import LiveMap from '@/components/admin/LiveMap';
import { Smartphone, Monitor, Tablet, Globe, Edit, X, Save } from 'lucide-react';
import { getAllStates, getMunicipalitiesByState, SEPOMEX_DATA } from '@/lib/data/sepomex';
import { CopyButton } from '@/components/ui/CopyButton';

function Badge({ children, color }: { children: React.ReactNode; color: 'red' | 'yellow' | 'blue' | 'green' | 'gray' }) {
  const map = {
    red: 'bg-red-100 text-red-800 border-red-200',
    yellow: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    blue: 'bg-blue-100 text-blue-800 border-blue-200',
    green: 'bg-green-100 text-green-800 border-green-200',
    gray: 'bg-gray-100 text-gray-800 border-gray-200',
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${map[color]}`}>
      {children}
    </span>
  );
}

function SeverityBadge({ level }: { level: SecuritySeverity }) {
  switch (level) {
    case 'critical': return <Badge color="red">CRÍTICO</Badge>;
    case 'high': return <Badge color="red">ALTO</Badge>;
    case 'medium': return <Badge color="yellow">MEDIO</Badge>;
    case 'low': return <Badge color="blue">BAJO</Badge>;
    default: return <Badge color="gray">{level}</Badge>;
  }
}

function StatusBadge({ status }: { status: SecurityStatus }) {
  switch (status) {
    case 'new': return <Badge color="blue">NUEVO</Badge>;
    case 'investigating': return <Badge color="yellow">INVESTIGANDO</Badge>;
    case 'resolved': return <Badge color="green">RESUELTO</Badge>;
    case 'ignored': return <Badge color="gray">IGNORADO</Badge>;
    default: return <Badge color="gray">{status}</Badge>;
  }
}

interface ProfileMap {
  [key: string]: {
    full_name: string;
    first_name?: string;
    last_name?: string;
    email: string;
    state?: string;
    city?: string;
  };
}

export default function AdminSeguridadPage() {
  const [alerts, setAlerts] = useState<SecurityAlert[]>([]);
  const [activeUsers, setActiveUsers] = useState<UserIP[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [presenceCount, setPresenceCount] = useState(0);
  const [stats, setStats] = useState({
    total: 0,
    critical: 0,
    unresolved: 0,
  });

  // Manual Location Update State
  const [editingLocation, setEditingLocation] = useState<UserIP | null>(null);
  const [locationForm, setLocationForm] = useState({ state: '', municipality: '' });
  const [savingLocation, setSavingLocation] = useState(false);

  // Realtime Presence Subscription
  useEffect(() => {
    const channel = supabase.channel('presence:global')
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const count = Object.keys(state).length;
        setPresenceCount(count);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      // 1. Fetch Alerts
      const { data: alertsData, error: alertsError } = await supabase
        .from('security_alerts')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (alertsError) throw alertsError;

      const typedAlerts = alertsData as SecurityAlert[];
      setAlerts(typedAlerts);
      
      const unresolved = typedAlerts.filter(a => a.status === 'new' || a.status === 'investigating').length;
      const critical = typedAlerts.filter(a => a.severity === 'critical' || a.severity === 'high').length;
      setStats({
        total: typedAlerts.length,
        critical,
        unresolved
      });

      // 2. Fetch Active Users (Last 15 minutes)
      const fifteenMinutesAgo = new Date(Date.now() - 15 * 60 * 1000).toISOString();
      const { data: usersData, error: usersError } = await supabase
        .from('user_ips')
        .select('*')
        .gt('detected_at', fifteenMinutesAgo)
        .order('detected_at', { ascending: false });
        
      if (usersError) throw usersError;
      const typedUsers = usersData as UserIP[];

      // Dedupe users (keep most recent per user_id) to avoid map clutter
      const uniqueUsersMap = new Map<string, UserIP>();
      typedUsers.forEach(u => {
        if (!uniqueUsersMap.has(u.user_id)) {
          uniqueUsersMap.set(u.user_id, u);
        }
      });
      // Convert map values back to array
      const uniqueTypedUsers = Array.from(uniqueUsersMap.values());

      // 3. Fetch Profiles for Names
      const userIds = new Set([
        ...typedAlerts.map(a => a.user_id),
        ...typedAlerts.map(a => a.related_user_id),
        ...uniqueTypedUsers.map(u => u.user_id)
      ].filter(Boolean) as string[]);

      let finalUsers = [...uniqueTypedUsers];

      if (userIds.size > 0) {
        // Use RPC to get secure data including email from auth.users
        const { data: profilesData, error: rpcError } = await supabase
          .rpc('get_admin_users_data', { user_ids: Array.from(userIds) });

        if (rpcError) {
          console.error('RPC Error (using fallback):', rpcError);
          // Fallback: Query profiles directly (email might be missing)
          const { data: fallbackData } = await supabase
            .from('profiles')
            .select('id, full_name, first_name, last_name, state, city')
            .in('id', Array.from(userIds));
            
          if (fallbackData) {
            const map: ProfileMap = {};
            fallbackData.forEach(p => {
              map[p.id] = { 
                full_name: p.full_name, 
                first_name: p.first_name, 
                last_name: p.last_name, 
                email: 'No disponible (Run SQL Fix)', // Placeholder
                state: p.state,
                city: p.city
              };
            });
            setProfiles(map);
          }
        } else if (profilesData) {
          const map: ProfileMap = {};
          profilesData.forEach((p: any) => {
            map[p.id] = { 
              full_name: p.full_name, 
              first_name: p.first_name, 
              last_name: p.last_name, 
              email: p.email || 'Sin email',
              state: p.state,
              city: p.city
            };
          });
          setProfiles(map);


          // 4. Enrich Users with Profile Location if IP location is missing
          finalUsers = finalUsers.map(u => {
            if (u.latitude && u.longitude) return u;
            
            const profile = map[u.user_id];
            if (profile?.state) {
              const stateData = SEPOMEX_DATA.find(s => 
                s.state.toLowerCase() === profile.state?.toLowerCase()
              );
              
              if (stateData) {
                // Try to match city/municipality
                let muni = stateData.municipalities.find(m => 
                  m.name.toLowerCase() === profile.city?.toLowerCase()
                );
                
                // Fallback to first municipality (usually capital or main city) if city doesn't match
                if (!muni && stateData.municipalities.length > 0) {
                  muni = stateData.municipalities[0];
                }

                if (muni) {
                  return {
                    ...u,
                    latitude: muni.latitude,
                    longitude: muni.longitude,
                    city: profile.city || muni.name,
                    region: profile.state,
                    country: 'Mexico',
                    is_approximate: true
                  };
                }
              }
            }
            return u;
          });
        }
      }

      setActiveUsers(finalUsers);

    } catch (err) {
      console.error('Error fetching security data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, []);

  const updateStatus = async (id: string, newStatus: SecurityStatus) => {
    try {
      const { error } = await supabase
        .from('security_alerts')
        .update({ status: newStatus })
        .eq('id', id);

      if (error) throw error;
      
      setAlerts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
    } catch (err) {
      console.error('Error updating status:', err);
      alert('Error actualizando estado');
    }
  };

  const handleEditLocation = (userIp: UserIP) => {
    setEditingLocation(userIp);
    // Try to match existing location or default to empty
    // If region exists and matches a state, use it.
    // If city exists, use it.
    const state = userIp.region || '';
    const municipality = userIp.city || '';
    setLocationForm({ state, municipality });
  };

  const saveLocation = async () => {
    if (!editingLocation) return;
    setSavingLocation(true);
    try {
      // Find coordinates for the selected municipality
      const stateData = SEPOMEX_DATA.find(s => s.state === locationForm.state);
      const muniData = stateData?.municipalities.find(m => m.name === locationForm.municipality);

      if (!muniData) {
        alert('Por favor selecciona un Estado y Municipio válidos.');
        setSavingLocation(false);
        return;
      }

      const updates = {
        city: locationForm.municipality,
        region: locationForm.state,
        country: 'Mexico', // Assuming SEPOMEX is Mexico
        latitude: muniData.latitude,
        longitude: muniData.longitude,
        metadata: {
          ...editingLocation.metadata,
          manual_location_update: true,
          updated_at: new Date().toISOString(),
          updated_by: 'admin' // In real app, get current admin ID
        }
      };

      const { error } = await supabase
        .from('user_ips')
        .update(updates)
        .eq('id', editingLocation.id);

      if (error) throw error;

      // Update local state
      setActiveUsers(prev => prev.map(u => u.id === editingLocation.id ? { ...u, ...updates } : u));
      setEditingLocation(null);
      alert('Ubicación actualizada correctamente.');
    } catch (err) {
      console.error('Error updating location:', err);
      alert('Error al guardar la ubicación.');
    } finally {
      setSavingLocation(false);
    }
  };

  return (
    <div className="space-y-6 relative">
      {/* Location Edit Modal */}
      {editingLocation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-gray-900">Actualizar Ubicación</h3>
              <button onClick={() => setEditingLocation(null)} className="rounded-full p-1 hover:bg-gray-100">
                <X size={20} className="text-gray-500" />
              </button>
            </div>
            
            <div className="mb-6 space-y-4">
              <div className="rounded-xl bg-blue-50 p-3 text-xs text-blue-700">
                Estás actualizando la ubicación para la IP: <span className="font-mono font-bold">{editingLocation.ip_address}</span>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Estado</label>
                <select
                  value={locationForm.state}
                  onChange={e => setLocationForm({ state: e.target.value, municipality: '' })}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
                >
                  <option value="">Selecciona un Estado</option>
                  {getAllStates().map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-gray-700">Municipio</label>
                <select
                  value={locationForm.municipality}
                  onChange={e => setLocationForm({ ...locationForm, municipality: e.target.value })}
                  disabled={!locationForm.state}
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink disabled:bg-gray-50"
                >
                  <option value="">Selecciona un Municipio</option>
                  {getMunicipalitiesByState(locationForm.state).map(m => (
                    <option key={m.name} value={m.name}>{m.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <button 
                onClick={() => setEditingLocation(null)}
                className="rounded-xl px-4 py-2 text-sm font-bold text-gray-500 hover:bg-gray-100"
              >
                Cancelar
              </button>
              <button 
                onClick={saveLocation}
                disabled={savingLocation || !locationForm.municipality}
                className="flex items-center gap-2 rounded-xl bg-brand-pink px-4 py-2 text-sm font-bold text-white hover:bg-pink-600 disabled:opacity-50"
              >
                {savingLocation ? 'Guardando...' : (
                  <>
                    <Save size={16} />
                    Guardar Ubicación
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-black text-gray-900">Seguridad y Fraude</h1>
          <p className="text-sm text-gray-500">Monitoreo de IPs, usuarios activos y alertas de fraude.</p>
        </div>
        <button 
          onClick={fetchData}
          className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-gray-700 shadow-sm ring-1 ring-black/5 hover:bg-gray-50"
        >
          ↻ Actualizar
        </button>
      </div>

      {/* Live Map & Active Users Grid */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Map Column */}
        <div className="lg:col-span-2">
           <div className="rounded-3xl border border-black/5 bg-white p-4 shadow-sm">
             <div className="mb-4 flex items-center justify-between px-2">
               <h2 className="text-lg font-bold text-gray-900">Mapa de Usuarios en Vivo</h2>
               <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-bold text-green-700 animate-pulse">
                 ● En tiempo real
               </span>
             </div>
             <LiveMap ips={activeUsers} />
           </div>
        </div>

        {/* Active Users List Column */}
        <div className="lg:col-span-1">
          <div className="h-[460px] rounded-3xl border border-black/5 bg-white shadow-sm flex flex-col">
            <div className="border-b border-black/5 px-6 py-4 flex justify-between items-center">
              <div>
                <h2 className="text-lg font-bold text-gray-900">Usuarios Conectados</h2>
                {presenceCount > activeUsers.length && (
                  <p className="text-[10px] text-orange-600 font-medium flex items-center gap-1">
                    ⚠️ {presenceCount - activeUsers.length} sin registrar en BD
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2">
                 <span title="Registrados en BD (últimos 15 min)" className="text-xs font-bold bg-gray-100 px-2 py-1 rounded-lg text-gray-600">
                  DB: {activeUsers.length}
                </span>
                <span title="Conectados en Tiempo Real (Socket)" className="text-xs font-bold bg-green-100 px-2 py-1 rounded-lg text-green-700 animate-pulse">
                  Live: {presenceCount}
                </span>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-2 space-y-2">
              {activeUsers.length === 0 ? (
                <div className="p-8 text-center text-sm text-gray-500">
                  No hay usuarios activos en los últimos 15 min.
                </div>
              ) : (
                activeUsers.map(u => (
                  <div key={u.id} className="flex items-center justify-between p-3 hover:bg-gray-50 rounded-xl border border-transparent hover:border-gray-100 transition-colors group">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="h-2 w-2 rounded-full bg-green-500 shrink-0" />
                      <div className="truncate w-full">
                        <div className="flex items-center gap-2">
                          <Link href={`/admin/usuarios?q=${u.user_id}`} className="block truncate text-sm font-bold text-gray-900 hover:text-blue-600">
                            {(() => {
                                const p = profiles[u.user_id];
                                const parts = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
                                return parts || p?.full_name || p?.email || 'Usuario desconocido';
                            })()}
                          </Link>
                        </div>
                        <div className="flex items-center gap-1 text-[10px] text-gray-500 font-mono mb-0.5">
                           ID: {u.user_id.slice(0, 8)}...
                           <CopyButton text={u.user_id} size="sm" />
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-1">
                          <span className="flag-icon">{u.country}</span> • {u.city || 'Desconocido'}, {u.region}
                          <button 
                            onClick={() => handleEditLocation(u)}
                            className="ml-1 p-1 hover:bg-gray-200 rounded text-gray-400 hover:text-brand-pink transition-colors"
                            title="Corregir ubicación manualmente"
                          >
                            <Edit size={14} />
                          </button>
                        </div>
                        <div className="mt-1 flex items-center gap-1.5 text-[10px] text-gray-400">
                          {u.metadata?.device?.type === 'mobile' ? <Smartphone size={10} /> : 
                           u.metadata?.device?.type === 'tablet' ? <Tablet size={10} /> : <Monitor size={10} />}
                          <span className="truncate max-w-[60px]">{u.metadata?.os?.name || 'Unknown OS'}</span>
                          <span className="text-gray-300">|</span>
                          <Globe size={10} />
                          <span className="truncate max-w-[60px]">{u.metadata?.browser?.name || 'Unknown Browser'}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                       <div className="text-[10px] font-mono text-gray-400">{u.ip_address}</div>
                       <div className="text-[10px] text-gray-400">Hace {Math.floor((Date.now() - new Date(u.detected_at).getTime()) / 60000)}m</div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="rounded-2xl border border-red-100 bg-red-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-red-600">Alertas Críticas</div>
          <div className="mt-1 text-3xl font-black text-red-900">{stats.critical}</div>
        </div>
        <div className="rounded-2xl border border-yellow-100 bg-yellow-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-yellow-600">Pendientes</div>
          <div className="mt-1 text-3xl font-black text-yellow-900">{stats.unresolved}</div>
        </div>
        <div className="rounded-2xl border border-blue-100 bg-blue-50 p-4">
          <div className="text-xs font-bold uppercase tracking-wider text-blue-600">Total Alertas</div>
          <div className="mt-1 text-3xl font-black text-blue-900">{stats.total}</div>
        </div>
      </div>

      {/* Alerts Table */}
      <div className="rounded-3xl border border-black/5 bg-white shadow-sm">
        <div className="border-b border-black/5 px-6 py-4">
          <h2 className="text-lg font-bold text-gray-900">Alertas Recientes</h2>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-6 py-3">Fecha</th>
                <th className="px-6 py-3">Severidad</th>
                <th className="px-6 py-3">Tipo</th>
                <th className="px-6 py-3">Usuarios Involucrados</th>
                <th className="px-6 py-3">IP / Detalles</th>
                <th className="px-6 py-3">Estado</th>
                <th className="px-6 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {loading && alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">Cargando alertas...</td>
                </tr>
              ) : alerts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-6 py-12 text-center text-gray-500">No hay alertas de seguridad registradas.</td>
                </tr>
              ) : (
                alerts.map((alert) => (
                  <tr key={alert.id} className="hover:bg-gray-50/50">
                    <td className="whitespace-nowrap px-6 py-4 text-gray-500">
                      {new Date(alert.created_at).toLocaleString('es-MX')}
                    </td>
                    <td className="px-6 py-4">
                      <SeverityBadge level={alert.severity} />
                    </td>
                    <td className="px-6 py-4 font-medium text-gray-900">
                      {alert.type}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col gap-1 text-xs">
                        {alert.user_id && (
                          <div className="flex items-center gap-1">
                             <Link href={`/admin/usuarios?q=${alert.user_id}`} className="font-bold text-blue-600 hover:underline">
                                {(() => {
                                    const p = profiles[alert.user_id];
                                    const parts = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
                                    return parts || p?.full_name || p?.email || 'Desconocido';
                                })()}
                             </Link>
                             <span className="text-gray-400 font-mono text-[10px]">{alert.user_id.slice(0, 6)}...</span>
                             <CopyButton text={alert.user_id} size="sm" />
                          </div>
                        )}
                        {alert.related_user_id && (
                          <div className="flex items-center gap-1">
                             <Link href={`/admin/usuarios?q=${alert.related_user_id}`} className="font-bold text-pink-600 hover:underline">
                                {(() => {
                                    const p = profiles[alert.related_user_id];
                                    const parts = [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim();
                                    return parts || p?.full_name || p?.email || 'Desconocido';
                                })()}
                             </Link>
                             <span className="text-gray-400 font-mono text-[10px]">{alert.related_user_id.slice(0, 6)}...</span>
                             <CopyButton text={alert.related_user_id} size="sm" />
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        {alert.ip_address && (
                          <div className="font-mono text-xs text-gray-600 bg-gray-100 px-1 rounded inline-block">
                            {alert.ip_address}
                          </div>
                        )}
                        <div className="text-xs text-gray-500 max-w-[200px] truncate" title={JSON.stringify(alert.details)}>
                          {alert.details?.message || JSON.stringify(alert.details)}
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <StatusBadge status={alert.status} />
                    </td>
                    <td className="px-6 py-4 text-right">
                      {alert.status === 'new' || alert.status === 'investigating' ? (
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => updateStatus(alert.id, 'resolved')}
                            className="text-xs font-bold text-green-600 hover:text-green-700 hover:underline"
                          >
                            Resolver
                          </button>
                          <button 
                            onClick={() => updateStatus(alert.id, 'ignored')}
                            className="text-xs font-bold text-gray-400 hover:text-gray-500 hover:underline"
                          >
                            Ignorar
                          </button>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400">Archivado</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <InvestigationTool profiles={profiles} />
    </div>
  );
}

function InvestigationTool({ profiles }: { profiles: ProfileMap }) {
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState<'ip' | 'user'>('ip');

  const search = async () => {
    if (!term) return;
    setLoading(true);
    setResults([]);
    try {
      let q = supabase.from('user_ips').select('*').order('detected_at', { ascending: false }).limit(50);
      
      if (type === 'ip') {
        q = q.eq('ip_address', term.trim());
      } else {
        q = q.eq('user_id', term.trim());
      }

      const { data, error } = await q;
      if (error) throw error;
      setResults(data || []);
    } catch (e) {
      console.error(e);
      alert('Error buscando datos');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-bold text-gray-900">Herramienta de Investigación</h2>
      <div className="flex flex-col gap-4 sm:flex-row">
        <select 
          value={type} 
          onChange={e => setType(e.target.value as any)}
          className="rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink"
        >
          <option value="ip">Buscar por IP</option>
          <option value="user">Buscar por Usuario (UUID)</option>
        </select>
        <input 
          type="text" 
          value={term}
          onChange={e => setTerm(e.target.value)}
          placeholder={type === 'ip' ? 'Ej: 192.168.1.1' : 'Ej: user-uuid-123'}
          className="flex-1 rounded-xl border border-gray-300 px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-brand-pink font-mono"
          onKeyDown={e => e.key === 'Enter' && search()}
        />
        <button 
          onClick={search}
          disabled={loading}
          className="rounded-xl bg-gray-900 px-6 py-2 text-sm font-bold text-white hover:bg-black disabled:opacity-50"
        >
          {loading ? 'Buscando...' : 'Buscar'}
        </button>
      </div>

      {results.length > 0 && (
        <div className="mt-6 overflow-hidden rounded-xl border border-gray-200">
          <table className="w-full text-left text-sm">
            <thead className="bg-gray-50 text-xs font-bold uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2">Fecha</th>
                <th className="px-4 py-2">IP Address</th>
                <th className="px-4 py-2">Usuario</th>
                <th className="px-4 py-2">Ubicación</th>
                <th className="px-4 py-2">Fuente</th>
                <th className="px-4 py-2">Coordenadas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {results.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-gray-500">{new Date(r.detected_at).toLocaleString()}</td>
                  <td className="px-4 py-2 font-mono">{r.ip_address}</td>
                  <td className="px-4 py-2 font-mono text-xs">
                    <div className="flex items-center gap-1">
                      <Link href={`/admin/usuarios?q=${r.user_id}`} className="text-blue-600 hover:underline font-bold">
                        {profiles[r.user_id]?.full_name || 'Usuario'}
                      </Link>
                      <CopyButton text={r.user_id} size="sm" />
                    </div>
                    <div className="text-[10px] text-gray-400">{r.user_id}</div>
                  </td>
                  <td className="px-4 py-2">
                    {r.city}, {r.country}
                  </td>
                  <td className="px-4 py-2">
                    {!r.is_approximate ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-xs font-bold text-green-700 border border-green-200">
                        📍 GPS
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-600 border border-gray-200">
                        🌐 IP
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-xs text-gray-500">
                    {r.latitude}, {r.longitude}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
